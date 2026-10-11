import { Inflate } from 'fflate';

export const MAX_JSON_ENTRY = 30 * 1024 * 1024; // 30 MiB por entrada individual
export const MAX_JSON_TOTAL = 30 * 1024 * 1024; // 30 MiB acumulados para JSONs relevantes
export const MAX_COMPRESSED_TOTAL = 30 * 1024 * 1024; // 30 MiB acumulados comprimidos para entradas relevantes
export const MAX_CENTRAL_DIR_SIZE = 16 * 1024 * 1024; // 16 MiB presupuesto para directorio central
export const MAX_RELEVANT_ENTRIES = 1000; // Máximo de entradas relacionales seleccionadas

export const EOCD_SIGNATURE = 0x06054b50;
export const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
export const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
export const LOCAL_HEADER_SIGNATURE = 0x04034b50;

// Tabla CRC32 estándar (polinomio IEEE 802.3 0xEDB88320)
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipSource {
  name?: string;
  size: number;
  slice(start: number, end: number): Blob | { arrayBuffer(): Promise<ArrayBuffer> };
}

export interface CentralDirectoryEntry {
  name: string;
  flag: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

/**
 * Descomprime un flujo DEFLATE puro (RFC 1951) acotando el tamaño máximo de salida
 * durante la descompresión para prevenir bombas de compresión (Zip Bombs).
 */
export function decompressDeflate(
  compressed: Uint8Array,
  maxOutputBytes: number,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let totalDecompressed = 0;
  let abortError: Error | null = null;

  const inflator = new Inflate((chunk) => {
    totalDecompressed += chunk.length;
    if (totalDecompressed > maxOutputBytes) {
      abortError = new Error('Los JSON superan el límite de 30 MB o 1.000 archivos.');
      throw abortError;
    }
    chunks.push(chunk);
  });

  const CHUNK_SIZE = 16384;
  try {
    if (compressed.length === 0) {
      inflator.push(new Uint8Array(0), true);
    } else {
      for (let i = 0; i < compressed.length; i += CHUNK_SIZE) {
        const slice = compressed.subarray(i, Math.min(i + CHUNK_SIZE, compressed.length));
        const isFinal = i + CHUNK_SIZE >= compressed.length;
        inflator.push(slice, isFinal);
      }
    }
  } catch (err: unknown) {
    if (abortError) throw abortError;
    if (err instanceof Error && err.message.includes('límite')) throw err;
    throw new Error('No se pudo abrir el ZIP. Puede estar dañado o protegido.');
  }

  const result = new Uint8Array(totalDecompressed);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Lee selectivamente las entradas requeridas de un archivo ZIP usando rangos (File.slice).
 * No carga el archivo ZIP completo en memoria ni lee datos de entradas no seleccionadas.
 */
export async function readZipSelective(
  source: ZipSource,
  isRelevant: (path: string) => boolean,
): Promise<Record<string, Uint8Array>> {
  if (source.size < 22) {
    throw new Error('No se pudo abrir el ZIP. Puede estar dañado o protegido.');
  }

  // 1. Localizar el registro EOCD en los últimos 65.557 bytes (22 fijo + 65.535 comentario máx)
  const searchLength = Math.min(source.size, 65557);
  const searchStart = source.size - searchLength;
  const searchBuffer = await source.slice(searchStart, source.size).arrayBuffer();
  const searchView = new DataView(searchBuffer);

  let eocdRel = -1;
  for (let i = searchBuffer.byteLength - 22; i >= 0; i--) {
    if (searchView.getUint32(i, true) === EOCD_SIGNATURE) {
      const commentLen = searchView.getUint16(i + 20, true);
      if (i + 22 + commentLen === searchBuffer.byteLength) {
        eocdRel = i;
        break;
      }
    }
  }

  if (eocdRel === -1) {
    throw new Error(
      'No se encontró el registro de fin de directorio central (EOCD). El archivo ZIP puede estar dañado o incompleto.',
    );
  }

  const eocdFileOffset = searchStart + eocdRel;
  const diskNumber = searchView.getUint16(eocdRel + 4, true);
  const cdStartDisk = searchView.getUint16(eocdRel + 6, true);
  const diskEntries = searchView.getUint16(eocdRel + 8, true);
  const totalEntries = searchView.getUint16(eocdRel + 10, true);
  const cdSize = searchView.getUint32(eocdRel + 12, true);
  const cdOffset = searchView.getUint32(eocdRel + 16, true);

  // 2. Detección y rechazo de ZIP64
  let hasZip64Locator = false;
  if (eocdFileOffset >= 20) {
    let locatorBuf: ArrayBuffer;
    if (eocdRel >= 20) {
      locatorBuf = searchBuffer.slice(eocdRel - 20, eocdRel);
    } else {
      locatorBuf = await source.slice(eocdFileOffset - 20, eocdFileOffset).arrayBuffer();
    }
    const locView = new DataView(locatorBuf);
    if (locView.getUint32(0, true) === ZIP64_LOCATOR_SIGNATURE) {
      hasZip64Locator = true;
    }
  }

  const isZip64 =
    hasZip64Locator ||
    diskNumber === 0xffff ||
    cdStartDisk === 0xffff ||
    diskEntries === 0xffff ||
    totalEntries === 0xffff ||
    cdSize === 0xffffffff ||
    cdOffset === 0xffffffff;

  if (isZip64) {
    throw new Error(
      'El archivo utiliza formato ZIP64 (más de 65.535 archivos o tamaño superior a 4 GB), no soportado en esta versión. Exportá solo seguidores y seguidos.',
    );
  }

  // 3. Validación de volumen y multidisco
  if (diskNumber !== 0 || cdStartDisk !== 0 || diskEntries !== totalEntries) {
    throw new Error('Los archivos ZIP multidisco no están soportados.');
  }

  if (cdOffset < 0 || cdSize < 0 || cdOffset + cdSize > eocdFileOffset) {
    throw new Error('Directorio central corrupto o fuera de los límites del archivo.');
  }

  if (cdSize > MAX_CENTRAL_DIR_SIZE) {
    throw new Error('El directorio central del ZIP supera el presupuesto de seguridad (16 MB).');
  }

  // 4. Lectura e inspección del Directorio Central
  const cdBuffer = await source.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
  const cdView = new DataView(cdBuffer);
  let cursor = 0;
  let parsedCount = 0;

  const entries: CentralDirectoryEntry[] = [];
  while (cursor < cdSize) {
    if (cursor + 46 > cdSize) {
      throw new Error('Directorio central corrupto: encabezado incompleto.');
    }
    if (cdView.getUint32(cursor, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new Error('Firma de encabezado del directorio central inválida.');
    }
    const flag = cdView.getUint16(cursor + 8, true);
    const method = cdView.getUint16(cursor + 10, true);
    const crc = cdView.getUint32(cursor + 16, true);
    const compressedSize = cdView.getUint32(cursor + 20, true);
    const uncompressedSize = cdView.getUint32(cursor + 24, true);
    const fnLen = cdView.getUint16(cursor + 28, true);
    const extraLen = cdView.getUint16(cursor + 30, true);
    const commentLen = cdView.getUint16(cursor + 32, true);
    const localOffset = cdView.getUint32(cursor + 42, true);

    const entryTotalLen = 46 + fnLen + extraLen + commentLen;
    if (cursor + entryTotalLen > cdSize) {
      throw new Error('Directorio central corrupto: entrada excede el bloque.');
    }

    const nameBytes = new Uint8Array(cdBuffer, cursor + 46, fnLen);
    const name = new TextDecoder('utf-8').decode(nameBytes);

    entries.push({
      name,
      flag,
      method,
      crc32: crc,
      compressedSize,
      uncompressedSize,
      localOffset,
    });

    cursor += entryTotalLen;
    parsedCount++;
  }

  if (parsedCount !== totalEntries) {
    throw new Error('Directorio central corrupto: cantidad de entradas no coincide.');
  }

  // 5. Filtrado de entradas relevantes y validaciones de seguridad
  const relevant = entries.filter((e) => isRelevant(e.name));

  if (relevant.length > MAX_RELEVANT_ENTRIES) {
    throw new Error('Los JSON superan el límite de 30 MB o 1.000 archivos.');
  }

  const basenames = new Set<string>();
  for (const entry of relevant) {
    const base = entry.name.replaceAll('\\', '/').split('/').pop()!.toLowerCase();
    if (basenames.has(base)) {
      throw new Error('Hay varias carpetas de seguidores. Importá los JSON de una sola cuenta.');
    }
    basenames.add(base);
  }

  let declaredTotal = 0;
  let declaredCompressedTotal = 0;
  for (const entry of relevant) {
    if (entry.uncompressedSize > MAX_JSON_ENTRY || entry.compressedSize > MAX_JSON_ENTRY) {
      throw new Error('Los JSON superan el límite de 30 MB o 1.000 archivos.');
    }
    declaredTotal += entry.uncompressedSize;
    declaredCompressedTotal += entry.compressedSize;
    if (declaredTotal > MAX_JSON_TOTAL || declaredCompressedTotal > MAX_COMPRESSED_TOTAL) {
      throw new Error('Los JSON superan el límite de 30 MB o 1.000 archivos.');
    }
  }

  // 6. Extracción selectiva de cada entrada relevante
  const results: Record<string, Uint8Array> = {};
  let cumulativeExtracted = 0;
  let cumulativeCompressedRead = 0;

  for (const entry of relevant) {
    const entryBase = entry.name.replaceAll('\\', '/').split('/').pop()!.toLowerCase();

    cumulativeCompressedRead += entry.compressedSize;
    if (cumulativeCompressedRead > MAX_COMPRESSED_TOTAL) {
      throw new Error('Los JSON superan el límite de 30 MB o 1.000 archivos.');
    }

    if (entry.localOffset < 0 || entry.localOffset + 30 > source.size || entry.localOffset + 30 > cdOffset) {
      throw new Error('Offset de encabezado local fuera de los límites del archivo.');
    }

    const lfhBuffer = await source.slice(entry.localOffset, entry.localOffset + 30).arrayBuffer();
    const lfhView = new DataView(lfhBuffer);
    if (lfhView.getUint32(0, true) !== LOCAL_HEADER_SIGNATURE) {
      throw new Error('Firma de encabezado local inválida.');
    }

    const lfhFlag = lfhView.getUint16(6, true);
    const lfhMethod = lfhView.getUint16(8, true);
    const lfhFnLen = lfhView.getUint16(26, true);
    const lfhExtraLen = lfhView.getUint16(28, true);

    if ((entry.flag & 0x0001) !== 0 || (lfhFlag & 0x0001) !== 0) {
      throw new Error('El archivo ZIP contiene entradas protegidas por contraseña no soportadas.');
    }

    if (entry.method !== 0 && entry.method !== 8) {
      throw new Error(`Método de compresión no soportado (${entry.method}).`);
    }

    if (lfhMethod !== entry.method) {
      throw new Error('Inconsistencia en método de compresión entre encabezado local y directorio central.');
    }

    // Bit 3: descriptor de datos posterior. Validar coherencia entre CD y LFH.
    const cdBit3 = (entry.flag & 0x0008) !== 0;
    const lfhBit3 = (lfhFlag & 0x0008) !== 0;
    if (cdBit3 !== lfhBit3) {
      throw new Error('Inconsistencia en banderas (bit 3) entre encabezado local y directorio central.');
    }

    if (!cdBit3) {
      const lfhCrc = lfhView.getUint32(14, true);
      const lfhComp = lfhView.getUint32(18, true);
      const lfhUncomp = lfhView.getUint32(22, true);
      if (
        lfhCrc !== entry.crc32 ||
        lfhComp !== entry.compressedSize ||
        lfhUncomp !== entry.uncompressedSize
      ) {
        throw new Error('Inconsistencia de integridad entre encabezado local y directorio central.');
      }
    }

    const lfhTotalHeader = 30 + lfhFnLen + lfhExtraLen;
    if (entry.localOffset + lfhTotalHeader > source.size || entry.localOffset + lfhTotalHeader > cdOffset) {
      throw new Error('Encabezado local fuera de los límites del archivo.');
    }

    const lfhNameBuf =
      lfhFnLen > 0
        ? await source.slice(entry.localOffset + 30, entry.localOffset + 30 + lfhFnLen).arrayBuffer()
        : new ArrayBuffer(0);
    const lfhName = new TextDecoder('utf-8').decode(new Uint8Array(lfhNameBuf));
    const normLfhName = lfhName.replaceAll('\\', '/').toLowerCase();
    const normEntryName = entry.name.replaceAll('\\', '/').toLowerCase();
    if (normLfhName !== normEntryName) {
      throw new Error('Inconsistencia de nombre de archivo entre encabezado local y directorio central.');
    }

    const dataOffset = entry.localOffset + lfhTotalHeader;
    if (
      dataOffset + entry.compressedSize > cdOffset ||
      dataOffset + entry.compressedSize > source.size
    ) {
      throw new Error(
        'El rango de datos invade el directorio central o está fuera de límites.',
      );
    }

    const dataBuffer = await source.slice(dataOffset, dataOffset + entry.compressedSize).arrayBuffer();
    const compressedBytes = new Uint8Array(dataBuffer);

    let decompressed: Uint8Array;
    const remainingBudget = MAX_JSON_TOTAL - cumulativeExtracted;
    const entryBudget = Math.min(MAX_JSON_ENTRY, remainingBudget);

    if (entry.method === 0) {
      if (compressedBytes.length > entryBudget) {
        throw new Error('Los JSON superan el límite de 30 MB o 1.000 archivos.');
      }
      decompressed = compressedBytes;
    } else {
      decompressed = decompressDeflate(compressedBytes, entryBudget);
    }

    if (decompressed.length !== entry.uncompressedSize) {
      throw new Error(`El archivo ${entryBase} tiene un tamaño descomprimido inconsistente con el declarado.`);
    }

    if (crc32(decompressed) !== entry.crc32) {
      throw new Error(`Error de integridad (CRC32) en ${entryBase}. El archivo ZIP puede estar dañado.`);
    }

    cumulativeExtracted += decompressed.length;
    if (cumulativeExtracted > MAX_JSON_TOTAL) {
      throw new Error('Los JSON superan el límite de 30 MB o 1.000 archivos.');
    }

    results[entry.name] = decompressed;
  }

  return results;
}

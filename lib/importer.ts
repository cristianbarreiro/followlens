import { unzip, strFromU8 } from 'fflate';
import { fileKind, parseRelationships } from './relationships.ts';

const MAX_ARCHIVE = 200 * 1024 * 1024,
  MAX_JSON = 30 * 1024 * 1024;
export async function importFiles(
  files: File[],
): Promise<{ followers: string[]; following: string[]; fileCount: number }> {
  if (!files.length) throw new Error('Elegí el ZIP o los archivos JSON.');
  if (files.reduce((sum, f) => sum + f.size, 0) > MAX_ARCHIVE)
    throw new Error(
      'Los archivos superan los 200 MB. Exportá solo seguidores y seguidos.',
    );
  const zipped = files.filter((f) => f.name.toLowerCase().endsWith('.zip'));
  if (zipped.length && files.length > 1)
    throw new Error(
      'Importá un ZIP por vez. Para comparar fechas, hacé dos importaciones separadas.',
    );
  const entries: Record<string, Uint8Array> = {};
  if (zipped.length) {
    const bytes = new Uint8Array(await zipped[0].arrayBuffer());
    const extracted = await new Promise<Record<string, Uint8Array>>(
      (resolve, reject) => {
        let size = 0,
          count = 0,
          tooLarge = false;
        unzip(
          bytes,
          {
            filter: (file) => {
              if (!fileKind(file.name)) return false;
              size += file.originalSize;
              count++;
              if (size > MAX_JSON || count > 1000) {
                tooLarge = true;
                return false;
              }
              return true;
            },
          },
          (error, result) => {
            if (tooLarge)
              reject(
                new Error(
                  'Los JSON superan el límite de 30 MB o 1.000 archivos.',
                ),
              );
            else if (error)
              reject(
                new Error(
                  'No se pudo abrir el ZIP. Puede estar dañado o protegido.',
                ),
              );
            else resolve(result);
          },
        );
      },
    );
    Object.assign(entries, extracted);
  } else {
    let total = 0;
    for (const file of files) {
      if (!fileKind(file.name)) continue;
      total += file.size;
      if (total > MAX_JSON)
        throw new Error('Los JSON superan el límite de 30 MB.');
      if (entries[file.name])
        throw new Error('Hay archivos repetidos. Elegí una única exportación.');
      entries[file.name] = new Uint8Array(await file.arrayBuffer());
    }
  }
  const found = { followers: false, following: false };
  const names = { followers: new Set<string>(), following: new Set<string>() };
  const basenames = new Set<string>();
  const parts: number[] = [];
  for (const [path, bytes] of Object.entries(entries)) {
    const kind = fileKind(path);
    if (!kind) continue;
    const base = path.replaceAll('\\', '/').split('/').pop()!.toLowerCase();
    if (basenames.has(base))
      throw new Error(
        'Hay varias carpetas de seguidores. Importá los JSON de una sola cuenta.',
      );
    basenames.add(base);
    if (kind === 'followers') {
      const match = /^followers_(\d+)\.json$/.exec(base);
      if (match) parts.push(Number(match[1]));
    }
    let data: unknown;
    try {
      data = JSON.parse(strFromU8(bytes).replace(/^\uFEFF/, ''));
    } catch {
      throw new Error(`El archivo ${base} no contiene JSON válido.`);
    }
    for (const name of parseRelationships(data, kind)) names[kind].add(name);
    found[kind] = true;
  }
  if (!found.followers || !found.following)
    throw new Error(
      'Necesitamos followers_1.json (y todas sus partes) y following.json de la misma exportación. Seleccionalos juntos o elegí el ZIP completo.',
    );
  parts.sort((a, b) => a - b);
  if (parts.some((n, i) => n !== i + 1))
    throw new Error(
      'Falta una parte de followers. Seleccioná todos los archivos de seguidores.',
    );
  return {
    followers: [...names.followers].sort(),
    following: [...names.following].sort(),
    fileCount: Object.keys(entries).length,
  };
}

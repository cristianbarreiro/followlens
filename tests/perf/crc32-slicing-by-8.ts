const initializationStartedAt = performance.now();

const CRC32_TABLES: Uint32Array[] = [new Uint32Array(256)];
for (let value = 0; value < 256; value++) {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC32_TABLES[0][value] = crc >>> 0;
}

for (let tableIndex = 1; tableIndex < 8; tableIndex++) {
  const previous = CRC32_TABLES[tableIndex - 1]!;
  const table = new Uint32Array(256);
  for (let value = 0; value < 256; value++) {
    const crc = previous[value]!;
    table[value] = (CRC32_TABLES[0]![crc & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  CRC32_TABLES.push(table);
}

export const tableInitializationMs =
  performance.now() - initializationStartedAt;
export const tableBytes = CRC32_TABLES.reduce(
  (total, table) => total + table.byteLength,
  0,
);

export function crc32SlicingBy8(bytes: Uint8Array): number {
  const tables = CRC32_TABLES;
  let crc = 0xffffffff;
  let offset = 0;
  const alignedEnd = bytes.byteLength - (bytes.byteLength % 8);

  while (offset < alignedEnd) {
    crc ^=
      bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24);
    crc =
      tables[7]![crc & 0xff]! ^
      tables[6]![(crc >>> 8) & 0xff]! ^
      tables[5]![(crc >>> 16) & 0xff]! ^
      tables[4]![(crc >>> 24) & 0xff]! ^
      tables[3]![bytes[offset + 4]!]! ^
      tables[2]![bytes[offset + 5]!]! ^
      tables[1]![bytes[offset + 6]!]! ^
      tables[0]![bytes[offset + 7]!]!;
    offset += 8;
  }

  while (offset < bytes.byteLength) {
    crc = tables[0]![(crc ^ bytes[offset]!) & 0xff]! ^ (crc >>> 8);
    offset++;
  }

  return (crc ^ 0xffffffff) >>> 0;
}

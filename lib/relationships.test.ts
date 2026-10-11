import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8, deflateSync } from 'fflate';
import {
  analyze,
  parseRelationships,
  normalize,
  timeline,
  csvRows,
  type Snapshot,
} from './relationships.ts';
import { importFiles } from './importer.ts';
import { crc32, decompressDeflate } from './zip.ts';

const snap = (
  date: string,
  followers: string[],
  following: string[],
  account = 'me',
): Snapshot => ({
  id: date,
  account,
  date,
  importedAt: date,
  followers,
  following,
});
const old = snap(
  '2026-08-01',
  ['ana', 'bruno', 'caro'],
  ['ana', 'bruno', 'dani'],
);
const now = snap('2026-09-01', ['ana', 'caro', 'eva'], ['ana', 'bruno', 'eva']);
const record = (value: string) => ({
  string_list_data: [{ value, timestamp: 1234 }],
});
const json = (name: string, data: unknown) =>
  new File([JSON.stringify(data)], name, { type: 'application/json' });
test('normalizes usernames without accepting URLs or spreadsheet formulas', () => {
  assert.equal(normalize(' @Ana.UY '), 'ana.uy');
  assert.equal(normalize('=SUM(A1)'), null);
  assert.equal(normalize('<script>'), null);
});
test('parses flat followers, wrapped following, title fallback and removes duplicates', () => {
  assert.deepEqual(
    parseRelationships([record('Ana'), record('ana')], 'followers'),
    ['ana'],
  );
  assert.deepEqual(
    parseRelationships(
      {
        relationships_following: [
          {
            title: 'bruno',
            string_list_data: [{ href: 'https://www.instagram.com/_u/bruno' }],
          },
        ],
      },
      'following',
    ),
    ['bruno'],
  );
  assert.deepEqual(
    parseRelationships(
      [{ string_list_data: [{ href: 'https://www.instagram.com/_u/caro/' }] }],
      'followers',
    ),
    ['caro'],
  );
});
test('rejects unsupported and partial records but accepts a genuine empty list', () => {
  assert.throws(() => parseRelationships({}, 'followers'));
  assert.throws(() => parseRelationships([record('ana'), {}], 'followers'));
  assert.deepEqual(parseRelationships([], 'followers'), []);
});
test('calculates current relationships', () => {
  const d = analyze(now);
  assert.deepEqual(d.mutuals, ['ana', 'eva']);
  assert.deepEqual(d.notBack, ['bruno']);
  assert.deepEqual(d.fans, ['caro']);
  assert.deepEqual(d.lost, []);
  assert.deepEqual(d.new, []);
});
test('compares both directions and mutuals accurately', () => {
  const d = analyze(now, old);
  assert.deepEqual(d.lost, ['bruno']);
  assert.deepEqual(d.new, ['eva']);
  assert.deepEqual(d.unfollowed, ['dani']);
  assert.deepEqual(d.followed, ['eva']);
  assert.deepEqual(d.lostMutuals, ['bruno']);
  assert.deepEqual(d.newMutuals, ['eva']);
});
test('blocks comparisons across accounts and backwards or equal dates', () => {
  assert.throws(() => analyze(now, { ...old, account: 'other' }));
  assert.throws(() => analyze(old, now));
  assert.throws(() => analyze(now, now));
});
test('handles empty complete snapshots and disjoint sets', () => {
  const empty = snap('2026-09-02', [], []);
  assert.equal(analyze(empty, now).lost.length, 3);
  assert.equal(analyze(empty).mutuals.length, 0);
});
test('history is chronological, collapses unchanged state and detects reappearance', () => {
  assert.deepEqual(
    timeline([snap('2026-10-01', ['bruno'], []), now, old], 'bruno'),
    [
      { date: '2026-08-01', state: 'Mutuos' },
      { date: '2026-09-01', state: 'Lo seguís' },
      { date: '2026-10-01', state: 'Te sigue' },
    ],
  );
});
test('CSV includes known first and last observations and excludes future and other accounts', () => {
  const csv = csvRows(['bruno'], 'lost', now, [
    old,
    now,
    snap('2026-10-01', ['bruno'], []),
    snap('2020-01-01', ['bruno'], [], 'other'),
  ]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"2026-08-01","2026-09-01","2026-09-01"'));
  assert.ok(!csv.includes('2020'));
  assert.ok(!csv.includes('2026-10'));
});
test('imports standalone multipart JSON files', async () => {
  const result = await importFiles([
    json('followers_1.json', [record('ana')]),
    json('followers_2.json', [record('bruno')]),
    json('following.json', { relationships_following: [record('ana')] }),
  ]);
  assert.deepEqual(result.followers, ['ana', 'bruno']);
  assert.deepEqual(result.following, ['ana']);
});
test('imports nested ZIPs, ignoring messages and unrelated invalid JSON', async () => {
  const bytes = zipSync({
    'connections/followers_and_following/followers_1.json': strToU8(
      JSON.stringify([record('ana')]),
    ),
    'connections/followers_and_following/following.json': strToU8(
      JSON.stringify({ relationships_following: [record('bruno')] }),
    ),
    'messages/message_1.json': strToU8('not valid JSON'),
  });
  const result = await importFiles([
    new File([bytes as BlobPart], 'instagram.zip'),
  ]);
  assert.equal(result.fileCount, 2);
  assert.deepEqual(result.followers, ['ana']);
});
test('rejects missing lists, malformed JSON and missing middle parts', async () => {
  await assert.rejects(importFiles([json('followers_1.json', [])]));
  await assert.rejects(
    importFiles([
      new File(['bad'], 'followers_1.json'),
      json('following.json', []),
    ]),
  );
  await assert.rejects(
    importFiles([
      json('followers_1.json', []),
      json('followers_3.json', []),
      json('following.json', []),
    ]),
  );
});
test('rejects duplicate account directories and multiple ZIPs', async () => {
  const bytes = zipSync({
    'a/followers_1.json': strToU8('[]'),
    'b/followers_1.json': strToU8('[]'),
    'following.json': strToU8('[]'),
  });
  await assert.rejects(
    importFiles([new File([bytes as BlobPart], 'accounts.zip')]),
  );
  await assert.rejects(
    importFiles([new File([], 'a.zip'), new File([], 'b.zip')]),
  );
});
test('rejects damaged ZIP and accepts legitimate empty files', async () => {
  await assert.rejects(importFiles([new File(['broken'], 'a.zip')]));
  const result = await importFiles([
    json('followers_1.json', []),
    json('following.json', { relationships_following: [] }),
  ]);
  assert.equal(result.followers.length, 0);
  assert.equal(result.following.length, 0);
});

// -------------------------------------------------------------
// Fase 3: Pruebas del lector ZIP selectivo por rangos
// -------------------------------------------------------------

interface SyntheticEntry {
  name: string;
  data?: Uint8Array;
  method?: number;
  crc?: number;
  compSize?: number;
  uncompSize?: number;
  flags?: number;
  localOffset?: number;
  lfhSig?: number;
  lfhMethod?: number;
  lfhCrc?: number;
  lfhCompSize?: number;
  lfhUncompSize?: number;
  lfhName?: string;
  cdSig?: number;
  isRawCompressed?: boolean;
}

interface SyntheticZipOptions {
  cdOffset?: number;
  cdSize?: number;
  diskNum?: number;
  cdDisk?: number;
  diskEntries?: number;
  totalEntries?: number;
  comment?: string;
  commentBytes?: Uint8Array;
  eocdSig?: number;
  precedingEocdBytes?: Uint8Array;
}

function buildSyntheticZip(
  entries: SyntheticEntry[],
  options: SyntheticZipOptions = {},
): Uint8Array {
  const parts: Uint8Array[] = [];
  const cdParts: Uint8Array[] = [];
  let currentOffset = 0;

  for (const entry of entries) {
    const fnBytes = strToU8(entry.name);
    let compData = entry.data ?? new Uint8Array(0);
    const method = entry.method ?? 0;
    if (method === 8 && !entry.isRawCompressed && entry.data) {
      compData = deflateSync(entry.data);
    }
    const computedCrc = entry.data ? crc32(entry.data) : 0;
    const finalCrc = entry.crc !== undefined ? entry.crc : computedCrc;
    const finalCompSize =
      entry.compSize !== undefined ? entry.compSize : compData.length;
    const finalUncompSize =
      entry.uncompSize !== undefined
        ? entry.uncompSize
        : entry.data
          ? entry.data.length
          : 0;
    const flags = entry.flags ?? 0;

    const lfhNameBytes = strToU8(entry.lfhName ?? entry.name);
    const lfh = new Uint8Array(30 + lfhNameBytes.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, entry.lfhSig ?? 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, flags, true);
    lv.setUint16(8, entry.lfhMethod !== undefined ? entry.lfhMethod : method, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, entry.lfhCrc !== undefined ? entry.lfhCrc : finalCrc, true);
    lv.setUint32(
      18,
      entry.lfhCompSize !== undefined ? entry.lfhCompSize : finalCompSize,
      true,
    );
    lv.setUint32(
      22,
      entry.lfhUncompSize !== undefined ? entry.lfhUncompSize : finalUncompSize,
      true,
    );
    lv.setUint16(26, lfhNameBytes.length, true);
    lv.setUint16(28, 0, true);
    lfh.set(lfhNameBytes, 30);

    const localOffset =
      entry.localOffset !== undefined ? entry.localOffset : currentOffset;
    parts.push(lfh, compData);
    currentOffset += lfh.length + compData.length;

    const cdh = new Uint8Array(46 + fnBytes.length);
    const cv = new DataView(cdh.buffer);
    cv.setUint32(0, entry.cdSig ?? 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, flags, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, finalCrc, true);
    cv.setUint32(20, finalCompSize, true);
    cv.setUint32(24, finalUncompSize, true);
    cv.setUint16(28, fnBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, localOffset, true);
    cdh.set(fnBytes, 46);
    cdParts.push(cdh);
  }

  const calculatedCdOffset = currentOffset;
  const cdBytesTotal = cdParts.reduce((sum, p) => sum + p.length, 0);

  const finalCdOffset =
    options.cdOffset !== undefined ? options.cdOffset : calculatedCdOffset;
  const finalCdSize =
    options.cdSize !== undefined ? options.cdSize : cdBytesTotal;

  const commentBytes = options.comment
    ? strToU8(options.comment)
    : (options.commentBytes ?? new Uint8Array(0));
  const precedingBytes = options.precedingEocdBytes ?? new Uint8Array(0);

  const eocd = new Uint8Array(22 + commentBytes.length);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, options.eocdSig ?? 0x06054b50, true);
  ev.setUint16(4, options.diskNum ?? 0, true);
  ev.setUint16(6, options.cdDisk ?? 0, true);
  ev.setUint16(
    8,
    options.diskEntries !== undefined ? options.diskEntries : entries.length,
    true,
  );
  ev.setUint16(
    10,
    options.totalEntries !== undefined ? options.totalEntries : entries.length,
    true,
  );
  ev.setUint32(12, finalCdSize, true);
  ev.setUint32(16, finalCdOffset, true);
  ev.setUint16(20, commentBytes.length, true);
  eocd.set(commentBytes, 22);

  const allSections = [...parts, ...cdParts];
  if (precedingBytes.length) allSections.push(precedingBytes);
  allSections.push(eocd);

  const totalLength = allSections.reduce((sum, s) => sum + s.length, 0);
  const result = new Uint8Array(totalLength);
  let pos = 0;
  for (const s of allSections) {
    result.set(s, pos);
    pos += s.length;
  }
  return result;
}

test('ZIP con EOCD y comentarios de distintas longitudes hasta la ventana maxima', async () => {
  const f1 = strToU8(JSON.stringify([record('usuario1')]));
  const fol = strToU8(
    JSON.stringify({ relationships_following: [record('usuario2')] }),
  );

  // 1. Sin comentario
  const zipNoComment = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8 },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  const res1 = await importFiles([
    new File([zipNoComment as BlobPart], 'nocomment.zip'),
  ]);
  assert.deepEqual(res1.followers, ['usuario1']);
  assert.deepEqual(res1.following, ['usuario2']);

  // 2. Comentario corto
  const zipShortComment = buildSyntheticZip(
    [
      { name: 'followers_1.json', data: f1, method: 8 },
      { name: 'following.json', data: fol, method: 8 },
    ],
    { comment: 'Exportación oficial de Instagram' },
  );
  const res2 = await importFiles([
    new File([zipShortComment as BlobPart], 'shortcomment.zip'),
  ]);
  assert.deepEqual(res2.followers, ['usuario1']);

  // 3. Comentario largo cercano al limite maximo de 65.535 bytes
  const longCommentBytes = new Uint8Array(65000);
  longCommentBytes.fill(88); // 'X'
  const zipLongComment = buildSyntheticZip(
    [
      { name: 'followers_1.json', data: f1, method: 8 },
      { name: 'following.json', data: fol, method: 8 },
    ],
    { commentBytes: longCommentBytes },
  );
  const res3 = await importFiles([
    new File([zipLongComment as BlobPart], 'longcomment.zip'),
  ]);
  assert.deepEqual(res3.followers, ['usuario1']);
});

test('firma EOCD falsa en comentario, ZIP truncado, cabeceras corruptas y multidisco', async () => {
  const f1 = strToU8(JSON.stringify([record('ana')]));
  const fol = strToU8(JSON.stringify({ relationships_following: [record('ana')] }));

  // 1. Firma EOCD falsa dentro del comentario
  // El comentario contiene bytes 0x50, 0x4b, 0x05, 0x06 simulando una firma falsa
  const fakeComment = new Uint8Array(50);
  fakeComment[0] = 0x50;
  fakeComment[1] = 0x4b;
  fakeComment[2] = 0x05;
  fakeComment[3] = 0x06;
  fakeComment[20] = 5; // Longitud de comentario engañosa que no coincide con el fin físico
  const zipWithFakeSig = buildSyntheticZip(
    [
      { name: 'followers_1.json', data: f1, method: 8 },
      { name: 'following.json', data: fol, method: 8 },
    ],
    { commentBytes: fakeComment },
  );
  const res = await importFiles([
    new File([zipWithFakeSig as BlobPart], 'fakesig.zip'),
  ]);
  assert.deepEqual(res.followers, ['ana']);

  // 2. ZIP truncado (< 22 bytes)
  await assert.rejects(
    importFiles([new File([new Uint8Array(10)], 'truncated.zip')]),
    /dañado o protegido/i,
  );

  // 3. Firma EOCD ausente / corrupta
  const zipNoEocd = buildSyntheticZip(
    [
      { name: 'followers_1.json', data: f1 },
      { name: 'following.json', data: fol },
    ],
    { eocdSig: 0x11223344 },
  );
  await assert.rejects(
    importFiles([new File([zipNoEocd as BlobPart], 'noeocd.zip')]),
    /No se encontró el registro de fin de directorio central/i,
  );

  // 4. Firma CDFH corrupta
  const zipBadCdSig = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, cdSig: 0x99999999 },
    { name: 'following.json', data: fol },
  ]);
  await assert.rejects(
    importFiles([new File([zipBadCdSig as BlobPart], 'badcd.zip')]),
    /Firma de encabezado del directorio central inválida/i,
  );

  // 5. ZIP multidisco
  const zipMultiDisk = buildSyntheticZip(
    [
      { name: 'followers_1.json', data: f1 },
      { name: 'following.json', data: fol },
    ],
    { diskNum: 1, totalEntries: 2 },
  );
  await assert.rejects(
    importFiles([new File([zipMultiDisk as BlobPart], 'multidisk.zip')]),
    /multidisco no están soportados/i,
  );
});

test('soporte de entradas STORE y DEFLATE y verificacion de CRC32', async () => {
  // Test de vector conocido CRC32 IEEE 802.3
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32(strToU8('123456789')), 0xcbf43926);

  const f1 = strToU8(JSON.stringify([record('store_user')]));
  const fol = strToU8(
    JSON.stringify({ relationships_following: [record('deflate_user')] }),
  );

  // followers_1.json en STORE (método 0) y following.json en DEFLATE (método 8)
  const zipMixed = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 0 },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  const res = await importFiles([
    new File([zipMixed as BlobPart], 'mixed.zip'),
  ]);
  assert.deepEqual(res.followers, ['store_user']);
  assert.deepEqual(res.following, ['deflate_user']);

  // CRC32 alterado / corrupto
  const zipBadCrc = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 0, crc: 0xdeadbeef },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipBadCrc as BlobPart], 'badcrc.zip')]),
    /Error de integridad \(CRC32\) en followers_1\.json/i,
  );
});

test('inconsistencia de encabezado local y bit 3 con marcadores legitimately validos', async () => {
  const f1 = strToU8(JSON.stringify([record('user_a')]));
  const fol = strToU8(JSON.stringify({ relationships_following: [record('user_b')] }));

  // 1. Inconsistencia de método entre LFH y CD
  const zipBadMethod = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8, lfhMethod: 0 },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipBadMethod as BlobPart], 'badmethod.zip')]),
    /Inconsistencia en método de compresión entre encabezado local y directorio central/i,
  );

  // 2. Firma LFH corrupta
  const zipBadLfhSig = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8, lfhSig: 0xdeadbeef },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipBadLfhSig as BlobPart], 'badlfh.zip')]),
    /Firma de encabezado local inválida/i,
  );

  // 3. Nombre de archivo LFH inconsistente con CD
  const zipBadLfhName = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8, lfhName: 'otro_nombre.json' },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipBadLfhName as BlobPart], 'badlfhname.zip')]),
    /Inconsistencia de nombre de archivo entre encabezado local y directorio central/i,
  );

  // 4. Bit 3 activo: LFH tiene marcadores en 0 para CRC, tamaño comprimido y tamaño descompreso.
  // El CD contiene los valores reales definitivos.
  const zipBit3 = buildSyntheticZip([
    {
      name: 'followers_1.json',
      data: f1,
      method: 8,
      flags: 0x0008, // bit 3 activo
      lfhCrc: 0,
      lfhCompSize: 0,
      lfhUncompSize: 0,
    },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  const resBit3 = await importFiles([
    new File([zipBit3 as BlobPart], 'bit3.zip'),
  ]);
  assert.deepEqual(resBit3.followers, ['user_a']);
  assert.deepEqual(resBit3.following, ['user_b']);
});

test('rechazo de metodos no soportados, entradas cifradas y formato ZIP64', async () => {
  const f1 = strToU8(JSON.stringify([record('u1')]));
  const fol = strToU8(JSON.stringify({ relationships_following: [record('u2')] }));

  // 1. Método de compresión no soportado (ej. método 9)
  const zipUnsupportedMethod = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 9 },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipUnsupportedMethod as BlobPart], 'unsupported.zip')]),
    /Método de compresión no soportado \(9\)/i,
  );

  // 2. Entrada cifrada (bit 0 de banderas activo)
  const zipEncrypted = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8, flags: 0x0001 },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipEncrypted as BlobPart], 'encrypted.zip')]),
    /entradas protegidas por contraseña no soportadas/i,
  );

  // 3. ZIP64 por total de entradas 0xFFFF en EOCD
  const zip64Entries = buildSyntheticZip(
    [
      { name: 'followers_1.json', data: f1, method: 8 },
      { name: 'following.json', data: fol, method: 8 },
    ],
    { totalEntries: 0xffff },
  );
  await assert.rejects(
    importFiles([new File([zip64Entries as BlobPart], 'zip64entries.zip')]),
    /utiliza formato ZIP64.*no soportado en esta versión/i,
  );

  // 4. ZIP64 por offset 0xFFFFFFFF en EOCD
  const zip64Offset = buildSyntheticZip(
    [
      { name: 'followers_1.json', data: f1, method: 8 },
      { name: 'following.json', data: fol, method: 8 },
    ],
    { cdOffset: 0xffffffff },
  );
  await assert.rejects(
    importFiles([new File([zip64Offset as BlobPart], 'zip64offset.zip')]),
    /utiliza formato ZIP64.*no soportado en esta versión/i,
  );

  // 5. ZIP64 locator presente antes de EOCD (firma 0x07064b50)
  const locatorBytes = new Uint8Array(20);
  new DataView(locatorBytes.buffer).setUint32(0, 0x07064b50, true);
  const zip64Locator = buildSyntheticZip(
    [
      { name: 'followers_1.json', data: f1, method: 8 },
      { name: 'following.json', data: fol, method: 8 },
    ],
    { precedingEocdBytes: locatorBytes },
  );
  await assert.rejects(
    importFiles([new File([zip64Locator as BlobPart], 'zip64locator.zip')]),
    /utiliza formato ZIP64.*no soportado en esta versión/i,
  );
});

test('rechazo de offsets invalidos, rangos fuera de limites y discrepancias de tamaño', async () => {
  const f1 = strToU8(JSON.stringify([record('u1')]));
  const fol = strToU8(JSON.stringify({ relationships_following: [record('u2')] }));

  // 1. localOffset fuera de los límites del archivo
  const zipBadLocalOffset = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8, localOffset: 999999 },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipBadLocalOffset as BlobPart], 'badoffset.zip')]),
    /Offset de encabezado local fuera de los límites del archivo/i,
  );

  // 2. Rango de datos que invade el Directorio Central
  const zipInvadingData = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8, compSize: 50000 },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipInvadingData as BlobPart], 'invade.zip')]),
    /El rango de datos invade el directorio central o está fuera de límites/i,
  );

  // 3. Tamaño descompreso declarado inconsistente con el real
  const zipSizeMismatch = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8, uncompSize: 99999 },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipSizeMismatch as BlobPart], 'mismatch.zip')]),
    /tiene un tamaño descomprimido inconsistente con el declarado/i,
  );
});

test('detencion temprana de descompresion ante bombas ZIP altamente comprimibles', () => {
  // Simular flujo DEFLATE altamente comprimible (ej. 35 MB de ceros)
  const largeZeros = new Uint8Array(35 * 1024 * 1024);
  const compressed = deflateSync(largeZeros);

  // Verificar que la función streaming aborte con error controlado sin asignar 35 MB
  assert.throws(
    () => decompressDeflate(compressed, 30 * 1024 * 1024),
    /Los JSON superan el límite de 30 MB o 1\.000 archivos/,
  );
});

test('ignora archivos multimedia sin solicitar sus rangos de datos ni descomprimirlos', async () => {
  const f1 = strToU8(JSON.stringify([record('ana')]));
  const fol = strToU8(JSON.stringify({ relationships_following: [record('ana')] }));

  // Archivo ficticio pesado de fotos y vídeos (150 KB de bytes binarios)
  const photoBytes = new Uint8Array(75000);
  photoBytes.fill(111);
  const videoBytes = new Uint8Array(75000);
  videoBytes.fill(222);

  const rawZip = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8 },
    { name: 'following.json', data: fol, method: 8 },
    { name: 'media/photo.jpg', data: photoBytes, method: 0 },
    { name: 'media/video.mp4', data: videoBytes, method: 0 },
  ]);

  // Espiar los rangos solicitados por slice()
  const requestedRanges: [number, number][] = [];
  const trackedFile = {
    name: 'export.zip',
    size: rawZip.length,
    slice(start: number, end: number) {
      requestedRanges.push([start, end]);
      return new Blob([rawZip.subarray(start, end) as unknown as BlobPart]);
    },
  };

  const res = await importFiles([trackedFile as unknown as File]);
  assert.equal(res.fileCount, 2);
  assert.deepEqual(res.followers, ['ana']);

  // Calcular la ventana de bytes donde residen los datos binarios multimedia
  // Entrada 1: followers_1 (LFH + compData)
  // Entrada 2: following (LFH + compData)
  // Entrada 3: media/photo.jpg (LFH + photoBytes)
  // Entrada 4: media/video.mp4 (LFH + videoBytes)
  // Ningún rango de datos de photoBytes ni videoBytes debe haber sido solicitado
  const lfh1Len = 30 + strToU8('followers_1.json').length;
  const f1Comp = deflateSync(f1).length;
  const lfh2Len = 30 + strToU8('following.json').length;
  const folComp = deflateSync(fol).length;
  const mediaStartOffset = lfh1Len + f1Comp + lfh2Len + folComp;
  const mediaEndOffset = mediaStartOffset + 30 + strToU8('media/photo.jpg').length + 75000 + 30 + strToU8('media/video.mp4').length + 75000;

  for (const [start, end] of requestedRanges) {
    // Si una solicitud cae dentro de la ventana de medios, es una violación
    const overlapsMediaData = start >= mediaStartOffset && end <= mediaEndOffset;
    assert.equal(
      overlapsMediaData,
      false,
      `Se solicitó un rango de datos perteneciente a multimedia: [${start}, ${end}]`,
    );
  }
});

test('admite archivo ZIP simulado superior a 200 MB mediante lectura selectiva', async () => {
  const f1 = strToU8(JSON.stringify([record('usuario_grande')]));
  const fol = strToU8(
    JSON.stringify({ relationships_following: [record('usuario_grande')] }),
  );

  // Construir ZIP real pequeño
  const smallZip = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8 },
    { name: 'following.json', data: fol, method: 8 },
  ]);

  // Simular un archivo sparse de 232 MB (243.269.632 bytes)
  // Las cabeceras del final residen en los últimos bytes del rango virtual
  const targetVirtualSize = 243_269_632;
  const eocdAndCdTailSize = 65557;
  const tailStart = targetVirtualSize - eocdAndCdTailSize;

  // Creamos un mapeador de rangos virtuales hacia el buffer real
  // Donde los primeros bytes corresponden a los LFHs y datos de smallZip,
  // y los últimos bytes de la ventana EOCD corresponden al final de smallZip.
  let totalBytesSliced = 0;
  const sparseBigFile = {
    name: 'instagram_232mb.zip',
    size: targetVirtualSize,
    slice(start: number, end: number) {
      totalBytesSliced += end - start;
      // Si solicita la ventana del final para EOCD:
      if (start >= tailStart) {
        const offsetInTail = start - tailStart;
        const smallZipTailOffset = Math.max(0, smallZip.length - eocdAndCdTailSize) + offsetInTail;
        const clampedEnd = Math.min(smallZip.length, smallZipTailOffset + (end - start));
        return new Blob([smallZip.subarray(smallZipTailOffset, clampedEnd) as unknown as BlobPart]);
      }
      // Si solicita datos del inicio (LFH y datos JSON):
      const clampedEnd = Math.min(smallZip.length, end);
      return new Blob([smallZip.subarray(start, clampedEnd) as unknown as BlobPart]);
    },
  };

  // Verificamos que readZipSelective procese un archivo de 232 MB reportado
  // sin rechazar por tamaño de archivo y sin requerir 232 MB de memoria física.
  const res = await importFiles([sparseBigFile as unknown as File]);
  assert.deepEqual(res.followers, ['usuario_grande']);
  // La cantidad de bytes leídos debe ser minúscula (apenas unas decenas de KB)
  assert.ok(
    totalBytesSliced < 200_000,
    `Se leyeron demasiados bytes (${totalBytesSliced}) en lugar de usar rangos selectivos`,
  );
});

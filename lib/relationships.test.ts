import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8, deflateSync } from 'fflate';
import { DOMParser } from 'linkedom';
import {
  analyze,
  parseRelationships,
  normalize,
  timeline,
  csvRows,
  type Snapshot,
} from './relationships.ts';
import {
  parseHtmlRelationships,
  extractUsernameFromUrl,
} from './html-parser.ts';
import { importFiles } from './importer.ts';
import { crc32, decompressDeflate } from './zip.ts';
import {
  parseUnavailableUsernames,
  withoutUnavailableProfiles,
} from './profile-availability.ts';

if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
}

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
void test(
  'rejects non-profile Instagram URLs when falling back to a JSON href',
  () => {
    assert.throws(
      () =>
        parseRelationships(
          [
            {
              string_list_data: [
                { href: 'https://www.instagram.com/p/synthetic-post' },
              ],
            },
          ],
          'followers',
        ),
      /No se pudo leer una cuenta/i,
    );
    assert.deepEqual(
      parseRelationships(
        [
          {
            string_list_data: [
              { href: 'https://www.instagram.com/_u/Cuenta.Ejemplo/' },
            ],
          },
        ],
        'followers',
      ),
      ['cuenta.ejemplo'],
    );
  },
);
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
void test('parses and normalizes a pasted list of locally identified usernames', () => {
  assert.deepEqual(parseUnavailableUsernames('@Ana, bruno\nANA; bad/name'), {
    usernames: ['ana', 'bruno'],
    invalid: ['bad/name'],
  });
});
void test('filters unavailable names from both sets without mutating the source snapshot', () => {
  const source = snap('2026-09-01', ['ana', 'bruno'], ['bruno', 'caro']);
  const filtered = withoutUnavailableProfiles(source, new Set(['bruno']));
  assert.deepEqual(filtered.followers, ['ana']);
  assert.deepEqual(filtered.following, ['caro']);
  assert.deepEqual(source.followers, ['ana', 'bruno']);
  assert.deepEqual(source.following, ['bruno', 'caro']);
  assert.equal(withoutUnavailableProfiles(source, new Set()), source);
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
void test('excludes the same manually marked names from both dates before comparison', () => {
  const marked = new Set(['bruno']);
  const before = withoutUnavailableProfiles(old, marked);
  const after = withoutUnavailableProfiles(now, marked);
  const result = analyze(after, before);
  assert.deepEqual(result.lost, []);
  assert.deepEqual(result.lostMutuals, []);
  assert.deepEqual(result.new, ['eva']);
  assert.deepEqual(old.followers, ['ana', 'bruno', 'caro']);
  assert.deepEqual(now.followers, ['ana', 'caro', 'eva']);
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
  lfhFlags?: number;
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
    const lfhFlags = entry.lfhFlags !== undefined ? entry.lfhFlags : flags;

    const lfhNameBytes = strToU8(entry.lfhName ?? entry.name);
    const lfh = new Uint8Array(30 + lfhNameBytes.length);
    const lv = new DataView(lfh.buffer);
    lv.setUint32(0, entry.lfhSig ?? 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, lfhFlags, true);
    lv.setUint16(
      8,
      entry.lfhMethod !== undefined ? entry.lfhMethod : method,
      true,
    );
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(
      14,
      entry.lfhCrc !== undefined ? entry.lfhCrc : finalCrc,
      true,
    );
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
  const fol = strToU8(
    JSON.stringify({ relationships_following: [record('ana')] }),
  );

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
  const fol = strToU8(
    JSON.stringify({ relationships_following: [record('user_b')] }),
  );

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

  // 3. Nombre de archivo LFH inconsistente con CD (nombre base diferente)
  const zipBadLfhName = buildSyntheticZip([
    {
      name: 'followers_1.json',
      data: f1,
      method: 8,
      lfhName: 'otro_nombre.json',
    },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipBadLfhName as BlobPart], 'badlfhname.zip')]),
    /Inconsistencia de nombre de archivo entre encabezado local y directorio central/i,
  );

  // 3b. Nombre de archivo LFH inconsistente con CD en ruta completa (mismo nombre base, carpeta distinta)
  const zipBadLfhPath = buildSyntheticZip([
    {
      name: 'connections/followers_and_following/followers_1.json',
      data: f1,
      method: 8,
      lfhName: 'spoofed_folder/followers_and_following/followers_1.json',
    },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipBadLfhPath as BlobPart], 'badlfhpath.zip')]),
    /Inconsistencia de nombre de archivo entre encabezado local y directorio central/i,
  );

  // 4a. Inconsistencia de bandera bit 3: CD tiene bit 3 inactivo pero LFH lo tiene activo
  const zipBit3Mismatch = buildSyntheticZip([
    {
      name: 'followers_1.json',
      data: f1,
      method: 8,
      flags: 0x0000,
      lfhFlags: 0x0008,
    },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipBit3Mismatch as BlobPart], 'bit3mismatch.zip')]),
    /Inconsistencia en banderas \(bit 3\) entre encabezado local y directorio central/i,
  );

  // 4b. Bit 3 inactivo pero LFH no coincide con los valores del CD
  const zipNoBit3Mismatch = buildSyntheticZip([
    {
      name: 'followers_1.json',
      data: f1,
      method: 8,
      flags: 0x0000,
      lfhFlags: 0x0000,
      lfhCrc: 0x12345678, // No coincide con CD crc
    },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([
      new File([zipNoBit3Mismatch as BlobPart], 'nobit3mismatch.zip'),
    ]),
    /Inconsistencia de integridad entre encabezado local y directorio central/i,
  );

  // 4c. Bit 3 activo coherente en ambos: LFH tiene marcadores en 0 para CRC, tamaño comprimido y descompreso.
  // El CD contiene los valores reales definitivos.
  const zipBit3 = buildSyntheticZip([
    {
      name: 'followers_1.json',
      data: f1,
      method: 8,
      flags: 0x0008, // bit 3 activo en CD
      lfhFlags: 0x0008, // bit 3 activo en LFH
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
  const fol = strToU8(
    JSON.stringify({ relationships_following: [record('u2')] }),
  );

  // 1. Método de compresión no soportado (ej. método 9)
  const zipUnsupportedMethod = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 9 },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([
      new File([zipUnsupportedMethod as BlobPart], 'unsupported.zip'),
    ]),
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
  const fol = strToU8(
    JSON.stringify({ relationships_following: [record('u2')] }),
  );

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

  // 4. Presupuesto acumulado de lectura comprimida excedido (>30 MB)
  const zipCompressedExceeded = buildSyntheticZip([
    {
      name: 'followers_1.json',
      data: f1,
      method: 8,
      compSize: 35 * 1024 * 1024,
    },
    { name: 'following.json', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([
      new File([zipCompressedExceeded as BlobPart], 'exceededcomp.zip'),
    ]),
    /Los JSON superan el límite de 30 MB o 1\.000 archivos/i,
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
  const fol = strToU8(
    JSON.stringify({ relationships_following: [record('ana')] }),
  );

  // Archivo ficticio pesado de fotos y vídeos (150 KB de bytes binarios)
  const photoBytes = new Uint8Array(75000);
  photoBytes.fill(111);
  const videoBytes = new Uint8Array(75000);
  videoBytes.fill(222);
  const ignoredTail = new Uint8Array(70000);

  const rawZip = buildSyntheticZip([
    { name: 'followers_1.json', data: f1, method: 8 },
    { name: 'following.json', data: fol, method: 8 },
    { name: 'media/photo.jpg', data: photoBytes, method: 0 },
    { name: 'media/video.mp4', data: videoBytes, method: 0 },
    { name: 'messages/chats.txt', data: ignoredTail, method: 0 },
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

  // Calcular las regiones exactas de datos multimedia (contenido binario)
  // Entrada 1: followers_1 (LFH + compData)
  // Entrada 2: following (LFH + compData)
  // Entrada 3: media/photo.jpg (LFH + photoBytes)
  // Entrada 4: media/video.mp4 (LFH + videoBytes)
  const lfh1Len = 30 + strToU8('followers_1.json').length;
  const f1Comp = deflateSync(f1).length;
  const lfh2Len = 30 + strToU8('following.json').length;
  const folComp = deflateSync(fol).length;
  const photoLfhStart = lfh1Len + f1Comp + lfh2Len + folComp;
  const photoDataStart = photoLfhStart + 30 + strToU8('media/photo.jpg').length;
  const photoDataEnd = photoDataStart + 75000;

  const videoLfhStart = photoDataEnd;
  const videoDataStart = videoLfhStart + 30 + strToU8('media/video.mp4').length;
  const videoDataEnd = videoDataStart + 75000;

  for (const [start, end] of requestedRanges) {
    // Detectar cualquier intersección entre el rango solicitado [start, end] y las regiones de datos multimedia
    const intersectsPhoto =
      Math.max(start, photoDataStart) < Math.min(end, photoDataEnd);
    const intersectsVideo =
      Math.max(start, videoDataStart) < Math.min(end, videoDataEnd);
    assert.equal(
      intersectsPhoto || intersectsVideo,
      false,
      `Se solicitó un rango que intersecta contenido multimedia: [${start}, ${end}] (foto: [${photoDataStart}, ${photoDataEnd}], video: [${videoDataStart}, ${videoDataEnd}])`,
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
        const smallZipTailOffset =
          Math.max(0, smallZip.length - eocdAndCdTailSize) + offsetInTail;
        const clampedEnd = Math.min(
          smallZip.length,
          smallZipTailOffset + (end - start),
        );
        return new Blob([
          smallZip.subarray(
            smallZipTailOffset,
            clampedEnd,
          ) as unknown as BlobPart,
        ]);
      }
      // Si solicita datos del inicio (LFH y datos JSON):
      const clampedEnd = Math.min(smallZip.length, end);
      return new Blob([
        smallZip.subarray(start, clampedEnd) as unknown as BlobPart,
      ]);
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

// -------------------------------------------------------------
// Fase 5: Pruebas del soporte de exportaciones HTML de Instagram
// -------------------------------------------------------------

function syntheticHtmlFollowers(
  usernames: string[],
  title = 'Seguidores',
): string {
  const records = usernames
    .map(
      (u) =>
        `<div class="pam uiBoxWhite noborder"><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/${u}">${u}</a></div><div>Oct 8, 2026, 12:00 PM</div></div></div></div>`,
    )
    .join('\n');
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body><div class="_li"><main role="main">${records}</main></div></body></html>`;
}

function syntheticHtmlFollowing(
  items: { username: string; heading?: string; hrefSlug?: string }[],
  title = 'Seguidos',
): string {
  const records = items
    .map((item) => {
      const headingHtml = item.heading
        ? `<h2 class="_3-95 _2pim">${item.heading}</h2>`
        : '';
      const slug = item.hrefSlug ?? item.username;
      return `<div class="pam uiBoxWhite noborder">${headingHtml}<div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/_u/${slug}">${item.username}</a></div><div>Oct 8, 2026, 12:00 PM</div></div></div></div>`;
    })
    .join('\n');
  return `<!DOCTYPE html><html><head><title>${title}</title></head><body><div class="_li"><main role="main">${records}</main></div></body></html>`;
}

test('importa ZIP con listas HTML validas y analiza relaciones correctamente', async () => {
  const htmlF = strToU8(syntheticHtmlFollowers(['alice', 'bob']));
  const htmlG = strToU8(
    syntheticHtmlFollowing([{ username: 'bob' }, { username: 'charlie' }]),
  );

  const zip = buildSyntheticZip([
    {
      name: 'connections/followers_and_following/followers_1.html',
      data: htmlF,
      method: 8,
    },
    {
      name: 'connections/followers_and_following/following.html',
      data: htmlG,
      method: 8,
    },
  ]);

  const res = await importFiles([
    new File([zip as BlobPart], 'export_html.zip'),
  ]);
  assert.equal(res.fileCount, 2);
  assert.deepEqual(res.followers, ['alice', 'bob']);
  assert.deepEqual(res.following, ['bob', 'charlie']);

  // Validar lógica de relaciones existente
  const rels = analyze({
    id: 'snap1',
    account: 'me',
    date: '2026-10-08',
    importedAt: '2026-10-08T12:00:00Z',
    followers: res.followers,
    following: res.following,
  });
  assert.deepEqual(rels.mutuals, ['bob']);
  assert.deepEqual(rels.notBack, ['charlie']);
  assert.deepEqual(rels.fans, ['alice']);
});

void test('prioriza la carpeta relacional oficial e ignora following.html de Threads', async () => {
  const followers = strToU8(
    syntheticHtmlFollowers(['seguidor_valido', 'mutuo_valido']),
  );
  const following = strToU8(
    syntheticHtmlFollowing([
      { username: 'seguido_valido' },
      { username: 'mutuo_valido' },
    ]),
  );
  const threadsFollowing = strToU8(
    syntheticHtmlFollowing([
      { username: 'solo_threads' },
      { username: 'mutuo_threads' },
    ]),
  );
  const zip = buildSyntheticZip([
    {
      name: 'your_instagram_activity/threads/following.html',
      data: threadsFollowing,
      method: 8,
    },
    {
      name: 'connections/followers_and_following/following.html',
      data: following,
      method: 8,
    },
    {
      name: 'connections/followers_and_following/followers_1.html',
      data: followers,
      method: 8,
    },
  ]);

  const result = await importFiles([
    new File([zip as BlobPart], 'official_export.zip'),
  ]);
  assert.equal(result.fileCount, 2);
  assert.deepEqual(result.followers, ['mutuo_valido', 'seguidor_valido']);
  assert.deepEqual(result.following, ['mutuo_valido', 'seguido_valido']);
  const relations = analyze(
    snap('2026-10-10', result.followers, result.following),
  );
  assert.deepEqual(relations.mutuals, ['mutuo_valido']);
  assert.deepEqual(relations.notBack, ['seguido_valido']);
  assert.deepEqual(relations.fans, ['seguidor_valido']);
});

void test('no completa exportaciones incompletas con archivos relacionales ajenos a la carpeta oficial', async () => {
  const followers = strToU8(syntheticHtmlFollowers(['seguidor_valido']));
  const threadsFollowing = strToU8(
    syntheticHtmlFollowing([{ username: 'solo_threads' }]),
  );
  const zip = buildSyntheticZip([
    {
      name: 'connections/followers_and_following/followers_1.html',
      data: followers,
      method: 8,
    },
    {
      name: 'your_instagram_activity/threads/following.html',
      data: threadsFollowing,
      method: 8,
    },
  ]);

  await assert.rejects(
    importFiles([new File([zip as BlobPart], 'incomplete_export.zip')]),
    /Necesitamos followers_1\.html.*following\.html/i,
  );
});

void test('rechaza carpetas oficiales relacionales ambiguas', async () => {
  const followers = strToU8(syntheticHtmlFollowers(['seguidor']));
  const following = strToU8(syntheticHtmlFollowing([{ username: 'seguido' }]));
  const zip = buildSyntheticZip([
    {
      name: 'account_a/connections/followers_and_following/followers_1.html',
      data: followers,
    },
    {
      name: 'account_b/connections/followers_and_following/following.html',
      data: following,
    },
  ]);

  await assert.rejects(
    importFiles([new File([zip as BlobPart], 'ambiguous_export.zip')]),
    /Hay varias carpetas de seguidores/i,
  );
});

test('admite multipartes HTML de seguidores y detecta saltos secuenciales', async () => {
  const f1 = strToU8(syntheticHtmlFollowers(['u1', 'u2']));
  const f2 = strToU8(syntheticHtmlFollowers(['u3', 'u4']));
  const fol = strToU8(syntheticHtmlFollowing([{ username: 'u1' }]));

  // 1. Multipartes válidas 1 y 2
  const zipParts = buildSyntheticZip([
    { name: 'followers_1.html', data: f1, method: 8 },
    { name: 'followers_2.html', data: f2, method: 8 },
    { name: 'following.html', data: fol, method: 8 },
  ]);
  const res = await importFiles([
    new File([zipParts as BlobPart], 'parts.zip'),
  ]);
  assert.deepEqual(res.followers, ['u1', 'u2', 'u3', 'u4']);

  // 2. Salto de partes (1 y 3 sin 2)
  const zipJump = buildSyntheticZip([
    { name: 'followers_1.html', data: f1, method: 8 },
    { name: 'followers_3.html', data: f2, method: 8 },
    { name: 'following.html', data: fol, method: 8 },
  ]);
  await assert.rejects(
    importFiles([new File([zipJump as BlobPart], 'jump.zip')]),
    /Falta una parte de followers/i,
  );
});

test('extraccion HTML desde rutas /_u/, entidades, encabezados y descarte de enlaces ajenos', () => {
  const html = `<!DOCTYPE html><html><head><title>Seguidos</title></head><body><main>
    <div class="pam uiBoxWhite"><h2 class="_2pim">user_from_h2</h2><div class="_a6-p"><div><div><a href="https://www.instagram.com/_u/slug_user">Display Name</a></div><div>Oct 8, 2026</div></div></div></div>
    <div class="pam uiBoxWhite"><div class="_a6-p"><div><div><a href="https://www.instagram.com/entity_user">&commat;entity_user</a></div><div>Oct 8, 2026</div></div></div></div>
    <div class="pam uiBoxWhite"><h2>heading_fallback</h2><div class="_a6-p"><a href="https://www.instagram.com/p/synthetic-post">Post</a></div></div>
    <div class="pam uiBoxWhite"><div class="_a6-p"><div><div><a href="https://www.instagram.com/legal/terms">Terms</a></div><div>Oct 8, 2026</div></div></div></div>
    <div class="pam uiBoxWhite"><div class="_a6-p"><div><div><a href="https://about.meta.com">About Meta</a></div><div>Oct 8, 2026</div></div></div></div>
  </main></body></html>`;

  const parsed = parseHtmlRelationships(html, 'following');
  assert.deepEqual(parsed, [
    'entity_user',
    'heading_fallback',
    'slug_user',
  ]);
  assert.deepEqual(
    parseHtmlRelationships(
      '<!DOCTYPE html><html><head><title>Following</title></head><body><a href="/valid_user">Valid</a><a>text_anchor_user</a></body></html>',
      'following',
    ),
    ['text_anchor_user', 'valid_user'],
  );
});

void test('extrae todos los registros bajo un contenedor HTML anidado', () => {
  const html = `<!DOCTYPE html><html><head><title>Seguidores</title></head><body><main>
    <div class="pam uiBoxWhite noborder">
      <div class="_a6-p"><a href="https://www.instagram.com/primer_usuario">Primer usuario</a></div>
      <div class="_a6-p"><a href="https://www.instagram.com/segundo_usuario">Segundo usuario</a></div>
    </div>
  </main></body></html>`;
  assert.deepEqual(
    parseHtmlRelationships(html, 'followers'),
    ['primer_usuario', 'segundo_usuario'],
  );
});

test('rechazo de HTML vacio, malformado o sin estructura reconocible', () => {
  // Vacío
  assert.throws(
    () => parseHtmlRelationships('', 'followers'),
    /está vacío o no es válido/i,
  );

  // Documento sin estructura compatible de Instagram
  const badHtml = `<!DOCTYPE html><html><head><title>Recetas de Cocina</title></head><body><p>Texto</p><a href="https://recetas.com">Receta</a></body></html>`;
  assert.throws(
    () => parseHtmlRelationships(badHtml, 'followers'),
    /no tiene una estructura compatible/i,
  );
});

test('ignora archivos HTML ajenos dentro del ZIP y no los procesa', async () => {
  const f1 = strToU8(syntheticHtmlFollowers(['usuario_a']));
  const fol = strToU8(syntheticHtmlFollowing([{ username: 'usuario_b' }]));
  const unrelatedHtml = strToU8(
    `<!DOCTYPE html><html><body><h1>start_here</h1></body></html>`,
  );
  const chatHtml = strToU8(
    `<!DOCTYPE html><html><body><h1>chats</h1></body></html>`,
  );

  const zip = buildSyntheticZip([
    { name: 'start_here.html', data: unrelatedHtml, method: 0 },
    {
      name: 'your_instagram_activity/messages/chats.html',
      data: chatHtml,
      method: 0,
    },
    {
      name: 'connections/followers_and_following/followers_1.html',
      data: f1,
      method: 8,
    },
    {
      name: 'connections/followers_and_following/following.html',
      data: fol,
      method: 8,
    },
  ]);

  const res = await importFiles([
    new File([zip as BlobPart], 'unrelated_html.zip'),
  ]);
  assert.equal(res.fileCount, 2);
  assert.deepEqual(res.followers, ['usuario_a']);
  assert.deepEqual(res.following, ['usuario_b']);
});

test('rechazo de importacion con formatos mezclados JSON y HTML', async () => {
  const fJson = strToU8(JSON.stringify([record('u1')]));
  const folHtml = strToU8(syntheticHtmlFollowing([{ username: 'u2' }]));

  const zipMixed = buildSyntheticZip([
    { name: 'followers_1.json', data: fJson, method: 8 },
    { name: 'following.html', data: folHtml, method: 8 },
  ]);

  await assert.rejects(
    importFiles([new File([zipMixed as BlobPart], 'mixed_formats.zip')]),
    /No mezcles archivos JSON y HTML/i,
  );

  const zipMixedInOfficialFolder = buildSyntheticZip([
    {
      name: 'connections/followers_and_following/followers_1.json',
      data: fJson,
      method: 8,
    },
    {
      name: 'connections/followers_and_following/following.html',
      data: folHtml,
      method: 8,
    },
  ]);
  await assert.rejects(
    importFiles([
      new File([zipMixedInOfficialFolder as BlobPart], 'mixed_official.zip'),
    ]),
    /No mezcles archivos JSON y HTML/i,
  );
});

test('admite importacion de archivos HTML sueltos sin ZIP', async () => {
  const htmlF = syntheticHtmlFollowers(['persona1', 'persona2']);
  const htmlG = syntheticHtmlFollowing([{ username: 'persona2' }]);

  const fileF = new File([htmlF], 'followers_1.html');
  const fileG = new File([htmlG], 'following.html');

  const res = await importFiles([fileF, fileG]);
  assert.equal(res.fileCount, 2);
  assert.deepEqual(res.followers, ['persona1', 'persona2']);
  assert.deepEqual(res.following, ['persona2']);
});

test('admite lista HTML de seguidores legitimamente vacia', async () => {
  const emptyHtmlF = `<!DOCTYPE html><html><head><title>Seguidores</title></head><body><main role="main"></main></body></html>`;
  const htmlG = syntheticHtmlFollowing([{ username: 'alguien' }]);

  const res = await importFiles([
    new File([emptyHtmlF], 'followers_1.html'),
    new File([htmlG], 'following.html'),
  ]);
  assert.deepEqual(res.followers, []);
  assert.deepEqual(res.following, ['alguien']);
});

test('validacion rigurosa de URL y username en HTML (rutas de contenido, hostnames y slugs)', () => {
  // URLs de perfiles válidas
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/usuario_valido'),
    'usuario_valido',
  );
  assert.equal(
    extractUsernameFromUrl('https://instagram.com/usuario_valido/'),
    'usuario_valido',
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/_u/usuario_slug'),
    'usuario_slug',
  );
  assert.equal(
    extractUsernameFromUrl('/_u/usuario_relativo_slug'),
    'usuario_relativo_slug',
  );
  assert.equal(
    extractUsernameFromUrl('/usuario_relativo'),
    'usuario_relativo',
  );
  assert.equal(
    extractUsernameFromUrl('./otro_usuario_relativo'),
    'otro_usuario_relativo',
  );
  assert.equal(
    extractUsernameFromUrl(
      'https://www.instagram.com/usuario_valido?utm_source=ig',
    ),
    'usuario_valido',
  );

  // Rutas de contenido de Instagram: NUNCA deben interpretarse como usuarios
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/p/DFxyz123/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/reel/C-abc12/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/reels/videos/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/stories/alguien/12345/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/tv/C-tv123/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl(
      'https://www.instagram.com/explore/tags/naturaleza/',
    ),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/explore/'),
    null,
  );

  // Enlaces institucionales, legales y de navegación
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/about/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/legal/terms/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/privacy/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/help/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/accounts/login/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/developer/'),
    null,
  );

  // Hostnames ajenos o ataques de suplantación
  assert.equal(
    extractUsernameFromUrl('https://evil.com/usuario_valido'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl(
      'https://www.instagram.com.attacker.com/usuario_valido',
    ),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://instagram.com.fake.org/usuario_valido'),
    null,
  );

  // Protocolos inseguros y formatos malformados
  assert.equal(
    extractUsernameFromUrl('javascript:alert(1)'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('mailto:user@instagram.com'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/_u/'),
    null,
  );
  assert.equal(
    extractUsernameFromUrl('https://www.instagram.com/_u/user/extra/path'),
    null,
  );
  assert.equal(extractUsernameFromUrl(''), null);
  assert.equal(extractUsernameFromUrl('   '), null);
});

test('rechazo de documentos ajenos con main y reconocimiento estricto de estructura relacional', () => {
  // Documento ajeno que contiene <main> pero sin marcadores de exportación
  const foreignWithMain = `<!DOCTYPE html><html><head><title>Mi Blog Personal</title></head><body><main><p>Artículo sobre viajes</p></main></body></html>`;
  assert.throws(
    () => parseHtmlRelationships(foreignWithMain, 'followers'),
    /no tiene una estructura compatible/i,
  );

  // Documento con <main> vacío pero sin título ni estilos de Instagram
  const emptyMainForeign = `<!DOCTYPE html><html><body><main></main></body></html>`;
  assert.throws(
    () => parseHtmlRelationships(emptyMainForeign, 'followers'),
    /no tiene una estructura compatible/i,
  );

  // Documento con título de seguidores pero que contiene exclusivamente enlaces externos
  const fakeFollowersExternal = `<!DOCTYPE html><html><head><title>Seguidores</title></head><body><main><a href="https://externo.com/perfil">Link</a></main></body></html>`;
  assert.throws(
    () => parseHtmlRelationships(fakeFollowersExternal, 'followers'),
    /no tiene una estructura compatible/i,
  );

  // Documento con título de seguidores pero que contiene exclusivamente enlaces de contenido (/p/)
  const fakeFollowersPosts = `<!DOCTYPE html><html><head><title>Seguidores</title></head><body><main><a href="https://www.instagram.com/p/DFxyz123/">Post</a></main></body></html>`;
  assert.throws(
    () => parseHtmlRelationships(fakeFollowersPosts, 'followers'),
    /no tiene una estructura compatible/i,
  );
});

test('rechazo de documentos HTML con registros donde no se puede extraer ningun usuario', () => {
  // Documento con bloques uiBoxWhite pero sin enlaces ni encabezados válidos
  const brokenRecordsHtml = `<!DOCTYPE html><html><head><title>Seguidores</title></head><body><main>
    <div class="pam uiBoxWhite"><div class="_a6-p"><p>Registro roto sin enlace</p></div></div>
  </main></body></html>`;

  assert.throws(
    () => parseHtmlRelationships(brokenRecordsHtml, 'followers'),
    /no tiene una estructura compatible|no se pudieron extraer nombres de usuario/i,
  );
});

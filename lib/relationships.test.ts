import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zipSync, strToU8 } from 'fflate';
import {
  analyze,
  parseRelationships,
  normalize,
  timeline,
  csvRows,
  type Snapshot,
} from './relationships.ts';
import { importFiles } from './importer.ts';

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

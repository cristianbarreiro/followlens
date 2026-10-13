import { performance } from 'node:perf_hooks';
import { strFromU8, strToU8, zipSync } from 'fflate';
import { DOMParser } from 'linkedom';
import { parseHtmlRelationships } from '../lib/html-parser.ts';
import { importFiles } from '../lib/importer.ts';
import {
  analyze,
  fileKind,
  parseRelationships,
  type Snapshot,
} from '../lib/relationships.ts';
import {
  MAX_JSON_TOTAL,
  decompressDeflate,
  readZipSelective,
  type ZipSource,
} from '../lib/zip.ts';

if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = DOMParser as unknown as typeof globalThis.DOMParser;
}

type Format = 'json' | 'html';
type Names = { followers: string[]; following: string[] };
type MemorySample = {
  heapUsedMiB: number;
  rssMiB: number;
  externalMiB: number;
  arrayBuffersMiB: number;
};

const mib = 1024 * 1024;
const record = (value: string) => ({
  string_list_data: [{ value, timestamp: 1 }],
});

function memorySample(): MemorySample {
  const usage = process.memoryUsage();
  return {
    heapUsedMiB: Number((usage.heapUsed / mib).toFixed(2)),
    rssMiB: Number((usage.rss / mib).toFixed(2)),
    externalMiB: Number((usage.external / mib).toFixed(2)),
    arrayBuffersMiB: Number((usage.arrayBuffers / mib).toFixed(2)),
  };
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

function nextEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function htmlFile(names: string[], kind: 'followers' | 'following') {
  const title = kind === 'followers' ? 'Seguidores' : 'Seguidos';
  const records = names
    .map(
      (name) =>
        `<div class="uiBoxWhite"><a href="https://www.instagram.com/${name}">${name}</a></div>`,
    )
    .join('');
  return `<!doctype html><html><head><title>${title}</title></head><body>${records}</body></html>`;
}

function makeZip(
  format: Format,
  names: Names,
  irrelevantBytes = 0,
  paddingBytes = 0,
): Uint8Array {
  const followers =
    format === 'json'
      ? JSON.stringify(names.followers.map(record)) + ' '.repeat(paddingBytes)
      : htmlFile(names.followers, 'followers');
  const following =
    format === 'json'
      ? JSON.stringify({
          relationships_following: names.following.map(record),
        })
      : htmlFile(names.following, 'following');
  const entries: Record<string, Uint8Array> = {
    ['connections/followers_and_following/followers_1.' + format]:
      strToU8(followers),
    ['connections/followers_and_following/following.' + format]:
      strToU8(following),
  };
  if (irrelevantBytes) {
    const irrelevant = new Uint8Array(irrelevantBytes);
    for (let i = 0; i < irrelevant.length; i++) irrelevant[i] = i % 251;
    entries['media/synthetic.bin'] = irrelevant;
  }
  return zipSync(entries, { level: irrelevantBytes ? 0 : 6 });
}

function relationshipNames(
  followerCount: number,
  followingCount: number,
  mutualCount: number,
): Names {
  return {
    followers: Array.from({ length: followerCount }, (_, i) => `f${i}`),
    following: Array.from(
      { length: followingCount },
      (_, i) => `f${i < mutualCount ? i : followerCount + i}`,
    ),
  };
}

function inspectRelevantEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= searchStart; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Synthetic benchmark ZIP has no EOCD.');

  const cursorEnd = view.getUint32(eocd + 12, true);
  const cursorStart = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: {
    compressedSize: number;
    uncompressedSize: number;
    method: number;
    dataOffset: number;
  }[] = [];
  let cursor = cursorStart;
  while (cursor < cursorStart + cursorEnd) {
    if (view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error('Synthetic benchmark ZIP has an invalid central entry.');
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    if (fileKind(name)) {
      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      entries.push({
        compressedSize,
        uncompressedSize,
        method,
        dataOffset: localOffset + 30 + localNameLength + localExtraLength,
      });
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseExtracted(
  extracted: Record<string, Uint8Array>,
  format: Format,
): Names {
  const names: Names = { followers: [], following: [] };
  for (const [path, bytes] of Object.entries(extracted)) {
    const kind = fileKind(path);
    if (!kind) continue;
    const text = strFromU8(bytes);
    const parsed =
      format === 'json'
        ? parseRelationships(JSON.parse(text), kind)
        : parseHtmlRelationships(text, kind);
    names[kind].push(...parsed);
  }
  return names;
}

function timed<T>(run: () => T): { value: T; ms: number } {
  const start = performance.now();
  const value = run();
  return { value, ms: performance.now() - start };
}

async function benchmarkScenario(
  label: string,
  format: Format,
  names: Names,
  options: { irrelevantBytes?: number; paddingBytes?: number } = {},
) {
  globalThis.gc?.();
  const bytes = makeZip(
    format,
    names,
    options.irrelevantBytes,
    options.paddingBytes,
  );
  const relevantMetadata = inspectRelevantEntries(bytes);
  const file = new File([toArrayBuffer(bytes)], `${label}.zip`, {
    type: 'application/zip',
  });
  let readCount = 0;
  const readTimes = { eocdMs: 0, centralDirectoryMs: 0, relevantRangesMs: 0 };
  const readBytes = {
    eocd: 0,
    centralDirectory: 0,
    relevantRanges: 0,
  };
  const source: ZipSource = {
    name: file.name,
    size: file.size,
    slice(start, end) {
      const category =
        readCount++ === 0
          ? 'eocd'
          : readCount === 2
            ? 'centralDirectory'
            : 'relevantRanges';
      return {
        async arrayBuffer() {
          const before = performance.now();
          const buffer = await file.slice(start, end).arrayBuffer();
          readTimes[`${category}Ms`] += performance.now() - before;
          readBytes[category] += buffer.byteLength;
          return buffer;
        },
      };
    },
  };

  globalThis.gc?.();
  const extractionMemoryBefore = memorySample();
  const extractionStart = performance.now();
  const extracted = await readZipSelective(
    source,
    (path) => fileKind(path) !== null,
  );
  const extractionMs = performance.now() - extractionStart;
  const extractionMemoryAfter = memorySample();
  const decompressedBytes = Object.values(extracted).reduce(
    (total, value) => total + value.byteLength,
    0,
  );
  const compressedBytes = relevantMetadata.reduce(
    (total, entry) => total + entry.compressedSize,
    0,
  );

  const deflateStart = performance.now();
  for (const entry of relevantMetadata) {
    if (entry.method !== 8) continue;
    const compressed = bytes.subarray(
      entry.dataOffset,
      entry.dataOffset + entry.compressedSize,
    );
    // Isolated replay reports inflate CPU separately from archive I/O and CRC checks.
    const decompressed = decompressDeflate(compressed, entry.uncompressedSize);
    if (decompressed.byteLength !== entry.uncompressedSize)
      throw new Error('Isolated DEFLATE replay returned an unexpected size.');
  }
  const isolatedDeflateMs = performance.now() - deflateStart;

  globalThis.gc?.();
  const parseMemoryBefore = memorySample();
  const parsing = timed(() => parseExtracted(extracted, format));
  const parseMemoryAfter = memorySample();

  const snapshot: Snapshot = {
    id: 'benchmark',
    account: 'synthetic',
    date: '2026-01-01',
    importedAt: '2026-01-01T00:00:00.000Z',
    followers: parsing.value.followers,
    following: parsing.value.following,
  };
  const relationships = timed(() => analyze(snapshot));

  globalThis.gc?.();
  const importMemoryBefore = memorySample();
  const importStart = performance.now();
  const imported = await importFiles([file]);
  const importMs = performance.now() - importStart;
  const importMemoryAfter = memorySample();
  if (
    imported.followers.length !== names.followers.length ||
    imported.following.length !== names.following.length
  ) {
    throw new Error(`Scenario "${label}" did not return the expected counts.`);
  }

  console.log(
    JSON.stringify({
      scenario: label,
      runtime: `Node ${process.version} / V8 ${process.versions.v8}`,
      archiveMiB: Number((file.size / mib).toFixed(2)),
      ignoredPayloadMiB: Number(
        ((options.irrelevantBytes ?? 0) / mib).toFixed(2),
      ),
      relevantCompressedBytes: compressedBytes,
      relevantCompressedMiB: Number((compressedBytes / mib).toFixed(4)),
      relevantDecompressedBytes: decompressedBytes,
      relevantDecompressedMiB: Number((decompressedBytes / mib).toFixed(3)),
      relevantEntryCount: relevantMetadata.length,
      relationshipCounts: {
        followers: imported.followers.length,
        following: imported.following.length,
        mutuals: relationships.value.mutuals.length,
        notBack: relationships.value.notBack.length,
        fans: relationships.value.fans.length,
      },
      timingsMs: {
        eocdRead: Number(readTimes.eocdMs.toFixed(2)),
        centralDirectoryRead: Number(readTimes.centralDirectoryMs.toFixed(2)),
        entryRangeReads: Number(readTimes.relevantRangesMs.toFixed(2)),
        selectiveExtractionAndIntegrity: Number(extractionMs.toFixed(2)),
        isolatedDeflateReplay: Number(isolatedDeflateMs.toFixed(2)),
        parsing: Number(parsing.ms.toFixed(2)),
        relationshipCalculation: Number(relationships.ms.toFixed(2)),
        endToEndImport: Number(importMs.toFixed(2)),
      },
      rangeReadBytes: readBytes,
      nodeMemoryMiB: {
        beforeExtraction: extractionMemoryBefore,
        afterExtraction: extractionMemoryAfter,
        beforeParsing: parseMemoryBefore,
        afterParsing: parseMemoryAfter,
        beforeEndToEnd: importMemoryBefore,
        afterEndToEnd: importMemoryAfter,
      },
    }),
  );
}

async function benchmarkLimitBoundary() {
  const emptyFollowing = strToU8(
    JSON.stringify({ relationships_following: [] }),
  );
  const baseFollowers = strToU8(JSON.stringify([record('limit_user')]));
  const exactPadding =
    MAX_JSON_TOTAL - emptyFollowing.length - baseFollowers.length;
  const exactArchive = makeZip(
    'json',
    { followers: ['limit_user'], following: [] },
    0,
    exactPadding,
  );
  const exactEntry = inspectRelevantEntries(exactArchive).find(
    (entry) =>
      entry.uncompressedSize === MAX_JSON_TOTAL - emptyFollowing.length,
  );
  if (!exactEntry) throw new Error('Exact-limit entry not found in fixture.');
  globalThis.gc?.();
  const exactMemoryBefore = memorySample();
  const exactStart = performance.now();
  const exactResult = await importFiles([
    new File([toArrayBuffer(exactArchive)], 'synthetic-exact-limit.zip'),
  ]);
  const exactMs = performance.now() - exactStart;
  const exactMemoryAfter = memorySample();
  if (exactResult.followers.length !== 1 || exactResult.following.length !== 0)
    throw new Error(
      'Exact-limit synthetic archive did not import successfully.',
    );
  await nextEventLoopTurn();
  globalThis.gc?.();
  const exactMemoryAfterGc = memorySample();
  await importFiles([
    new File([toArrayBuffer(exactArchive)], 'synthetic-exact-limit-repeat.zip'),
  ]);
  await nextEventLoopTurn();
  globalThis.gc?.();
  const exactMemoryAfterRepeatGc = memorySample();

  const overLimitFollowers = strToU8(
    JSON.stringify([record('limit_user')]) +
      ' '.repeat(MAX_JSON_TOTAL - 2 - baseFollowers.length + 1),
  );
  const overLimitArchive = zipSync({
    'followers_1.json': overLimitFollowers,
    'following.json': strToU8('[]'),
  });
  let controlledError = false;
  try {
    await importFiles([
      new File([toArrayBuffer(overLimitArchive)], 'synthetic-over-limit.zip'),
    ]);
  } catch (error) {
    controlledError =
      error instanceof Error && /límite de 30 MB/.test(error.message);
  }
  if (!controlledError)
    throw new Error('Over-limit synthetic archive did not fail controllably.');

  console.log(
    JSON.stringify({
      scenario: 'exact-and-over-limit',
      nodeRuntime: `Node ${process.version} / V8 ${process.versions.v8}`,
      allowedUncompressedBytes: MAX_JSON_TOTAL,
      allowedArchiveBytes: exactArchive.byteLength,
      allowedResult: 'accepted',
      allowedImportMs: Number(exactMs.toFixed(2)),
      allowedMemoryBeforeMiB: exactMemoryBefore,
      allowedMemoryImmediatelyAfterMiB: exactMemoryAfter,
      allowedMemoryAfterGcMiB: exactMemoryAfterGc,
      allowedMemoryAfterRepeatAndGcMiB: exactMemoryAfterRepeatGc,
      overLimitUncompressedBytes: MAX_JSON_TOTAL + 1,
      overLimitResult: 'controlled 30 MiB budget error',
      note: 'The payload is synthetic JSON whitespace padding, not account data.',
    }),
  );
}

async function main() {
  const small = relationshipNames(40, 30, 12);
  const medium = relationshipNames(10_000, 8_000, 2_500);
  await benchmarkScenario('small-json', 'json', small);
  await benchmarkScenario('small-html', 'html', small);
  await benchmarkScenario('medium-json', 'json', medium);
  await benchmarkScenario('large-irrelevant-zip', 'json', small, {
    irrelevantBytes: 32 * mib,
  });
  await benchmarkLimitBoundary();
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Importer benchmark failed.',
  );
  process.exitCode = 1;
});

import { performance as nodePerformance } from 'node:perf_hooks';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import {
  MAX_COMPRESSED_TOTAL,
  MAX_JSON_ENTRY,
  MAX_JSON_TOTAL,
} from '../../lib/zip.ts';

const appAddress = new URL('http://localhost:4173');
const importDate = '2020-01-02';

type BrowserOutcome = 'success' | 'error' | null;
type LongTaskSample = { startTime: number; duration: number };
type BrowserBenchmarkState = {
  longTasksSupported: boolean;
  longTasks: LongTaskSample[];
  startedAt: number | null;
  finishedAt: number | null;
  outcome: BrowserOutcome;
  memoryBeforeBytes: number | null;
  jsonParseMs: number;
  jsonParseCount: number;
  observer: PerformanceObserver | null;
};

declare global {
  interface Window {
    __followLensBenchmark?: BrowserBenchmarkState;
  }
}

type BrowserSignals = {
  consoleErrors: number;
  pageErrors: number;
  externalOrigins: string[];
};

type RelationshipCounts = {
  followers: number;
  following: number;
  mutuals: number;
  notBack: number;
};
type ZipCompression = 'deflate' | 'store';

type SyntheticArchive = {
  buffer: Buffer;
  archiveBytes: number;
  compressedBytes: number;
  uncompressedBytes: number;
  entryUncompressedBytes: number[];
  entryCrc32: Record<string, number>;
  compression: ZipCompression;
  compressionMethod: 0 | 8;
  counts: RelationshipCounts;
};

type CpuProfileNode = {
  id: number;
  callFrame: {
    functionName: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  children?: number[];
};
type CpuProfile = {
  nodes: CpuProfileNode[];
  samples?: number[];
  timeDeltas?: number[];
};
type CpuProfileRow = {
  functionName: string;
  source: string;
  line: number;
  selfMs: number;
  inclusiveMs: number;
};

function isLocalAppTraffic(url: URL): boolean {
  return (
    url.hostname === appAddress.hostname &&
    url.port === appAddress.port &&
    (url.protocol === 'http:' || url.protocol === 'ws:')
  );
}

function monitorBrowser(page: Page): BrowserSignals {
  const signals: BrowserSignals = {
    consoleErrors: 0,
    pageErrors: 0,
    externalOrigins: [],
  };
  page.on('console', (message) => {
    if (message.type() === 'error') signals.consoleErrors += 1;
  });
  page.on('pageerror', () => {
    signals.pageErrors += 1;
  });
  page.context().on('request', (request) => {
    const url = new URL(request.url());
    if (!isLocalAppTraffic(url)) signals.externalOrigins.push(url.origin);
  });
  page.on('websocket', (socket) => {
    const url = new URL(socket.url());
    if (!isLocalAppTraffic(url)) signals.externalOrigins.push(url.origin);
  });
  return signals;
}

function assertNoExternalTrafficOrErrors(signals: BrowserSignals): void {
  expect(signals.consoleErrors).toBe(0);
  expect(signals.pageErrors).toBe(0);
  expect(signals.externalOrigins).toEqual([]);
}

function record(value: string) {
  return { string_list_data: [{ value, timestamp: 1 }] };
}

function makeRelationshipZip(
  followers: string[],
  following: string[],
  compression: ZipCompression = 'deflate',
): SyntheticArchive {
  const followerBytes = strToU8(JSON.stringify(followers.map(record)));
  const followingBytes = strToU8(
    JSON.stringify({
      relationships_following: following.map(record),
    }),
  );
  const archive = zipSync(
    {
      'connections/followers_and_following/followers_1.json': followerBytes,
      'connections/followers_and_following/following.json': followingBytes,
    },
    { level: compression === 'store' ? 0 : 6 },
  );
  const followingSet = new Set(following);
  const mutuals = followers.filter((name) => followingSet.has(name)).length;
  const metadata = inspectArchive(archive);
  const expectedMethod = compression === 'store' ? 0 : 8;
  if (
    metadata.relevantEntries !== 2 ||
    metadata.compressionMethods.some((method) => method !== expectedMethod)
  ) {
    throw new Error(
      `Synthetic ${compression.toUpperCase()} ZIP does not declare the expected method.`,
    );
  }
  return {
    buffer: Buffer.from(archive),
    archiveBytes: archive.byteLength,
    compressedBytes: metadata.compressedBytes,
    uncompressedBytes: followerBytes.byteLength + followingBytes.byteLength,
    entryUncompressedBytes: metadata.entryUncompressedBytes,
    entryCrc32: metadata.entryCrc32,
    compression,
    compressionMethod: expectedMethod,
    counts: {
      followers: followers.length,
      following: following.length,
      mutuals,
      notBack: following.length - mutuals,
    },
  };
}

function inspectArchive(archive: Uint8Array): {
  compressedBytes: number;
  uncompressedBytes: number;
  entryUncompressedBytes: number[];
  relevantEntries: number;
  compressionMethods: number[];
  entryCrc32: Record<string, number>;
} {
  const view = new DataView(
    archive.buffer,
    archive.byteOffset,
    archive.byteLength,
  );
  const searchStart = Math.max(0, archive.byteLength - 65_557);
  let eocd = -1;
  for (let offset = archive.byteLength - 22; offset >= searchStart; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error('Synthetic benchmark ZIP has no EOCD.');

  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  const centralEnd = centralOffset + centralSize;
  let cursor = centralOffset;
  let compressedBytes = 0;
  let uncompressedBytes = 0;
  const entryUncompressedBytes: number[] = [];
  let relevantEntries = 0;
  const compressionMethods: number[] = [];
  const entryCrc32: Record<string, number> = {};
  while (cursor < centralEnd) {
    if (view.getUint32(cursor, true) !== 0x02014b50)
      throw new Error('Synthetic benchmark ZIP has an invalid central entry.');
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const name = new TextDecoder().decode(
      archive.subarray(cursor + 46, cursor + 46 + nameLength),
    );
    if (/(?:^|\/)(?:followers_\d+|following)\.json$/i.test(name)) {
      compressedBytes += compressedSize;
      uncompressedBytes += uncompressedSize;
      entryUncompressedBytes.push(uncompressedSize);
      relevantEntries += 1;
      compressionMethods.push(view.getUint16(cursor + 10, true));
      entryCrc32[name] = view.getUint32(cursor + 16, true);
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralEnd)
    throw new Error('Synthetic benchmark ZIP central directory is incomplete.');
  return {
    compressedBytes,
    uncompressedBytes,
    entryUncompressedBytes,
    relevantEntries,
    compressionMethods,
    entryCrc32,
  };
}

function makeBudgetZip(
  totalUncompressedBytes: number,
  compression: ZipCompression = 'deflate',
): SyntheticArchive {
  const followersBase = JSON.stringify([record('scale_follower')]);
  const followingJson = JSON.stringify({ relationships_following: [] });
  const followingBytes = strToU8(followingJson);
  const followerTargetBytes = totalUncompressedBytes - followingBytes.byteLength;
  const followerBaseBytes = strToU8(followersBase);
  if (
    followerTargetBytes < followerBaseBytes.byteLength ||
    followerTargetBytes > MAX_JSON_ENTRY
  ) {
    throw new Error('Synthetic budget payload is outside the per-entry limit.');
  }

  const followerJson =
    followersBase +
    ' '.repeat(followerTargetBytes - followerBaseBytes.byteLength);
  const followerBytes = strToU8(followerJson);
  const parsedFollowers: unknown = JSON.parse(followerJson);
  const parsedFollowing: unknown = JSON.parse(followingJson);
  if (
    !Array.isArray(parsedFollowers) ||
    parsedFollowers.length !== 1 ||
    !parsedFollowing ||
    typeof parsedFollowing !== 'object' ||
    !('relationships_following' in parsedFollowing) ||
    !Array.isArray(parsedFollowing.relationships_following)
  ) {
    throw new Error('Synthetic budget payload does not match importer schemas.');
  }

  const archive = zipSync(
    {
      'connections/followers_and_following/followers_1.json': followerBytes,
      'connections/followers_and_following/following.json': followingBytes,
    },
    { level: compression === 'store' ? 0 : 6 },
  );
  const metadata = inspectArchive(archive);
  const expectedMethod = compression === 'store' ? 0 : 8;
  if (
    metadata.relevantEntries !== 2 ||
    metadata.uncompressedBytes !== totalUncompressedBytes ||
    metadata.compressedBytes > MAX_COMPRESSED_TOTAL ||
    metadata.compressionMethods.some((method) => method !== expectedMethod)
  ) {
    throw new Error('Synthetic budget ZIP does not match importer limits.');
  }
  const mutuals = 0;
  return {
    buffer: Buffer.from(archive),
    archiveBytes: archive.byteLength,
    compressedBytes: metadata.compressedBytes,
    uncompressedBytes: metadata.uncompressedBytes,
    entryUncompressedBytes: metadata.entryUncompressedBytes,
    entryCrc32: metadata.entryCrc32,
    compression,
    compressionMethod: expectedMethod,
    counts: { followers: 1, following: 0, mutuals, notBack: 0 },
  };
}

function mediumArchive(compression: ZipCompression): SyntheticArchive {
  const followerCount = 5_000;
  const followingCount = 4_000;
  const mutualCount = 2_500;
  const followers = Array.from(
    { length: followerCount },
    (_, index) => `f${String(index).padStart(5, '0')}`,
  );
  const following = [
    ...followers.slice(0, mutualCount),
    ...Array.from(
      { length: followingCount - mutualCount },
      (_, index) => `n${String(index).padStart(5, '0')}`,
    ),
  ];
  const archive = makeRelationshipZip(followers, following, compression);
  if (
    archive.counts.followers !== followerCount ||
    archive.counts.following !== followingCount ||
    archive.counts.mutuals !== mutualCount ||
    archive.counts.notBack !== followingCount - mutualCount
  ) {
    throw new Error('Synthetic medium fixture relationship counts are invalid.');
  }
  return archive;
}

function isOfficialRelationshipRow(value: unknown): boolean {
  if (
    !value ||
    typeof value !== 'object' ||
    !('title' in value) ||
    typeof value.title !== 'string' ||
    !('string_list_data' in value) ||
    !Array.isArray(value.string_list_data)
  ) {
    return false;
  }
  const first = value.string_list_data[0];
  return (
    !!first &&
    typeof first === 'object' &&
    'value' in first &&
    typeof first.value === 'string' &&
    'href' in first &&
    typeof first.href === 'string' &&
    'timestamp' in first &&
    typeof first.timestamp === 'number'
  );
}

function realisticUsername(kind: 'f' | 'n', index: number): string {
  return `synthetic_${kind}_${index.toString(36).padStart(6, '0')}`;
}

function realisticTimestamp(kind: 'f' | 'n', index: number): number {
  return (
    1_600_000_000 +
    ((index * 104_729 + (kind === 'f' ? 8_191 : 97_409)) % 200_000_000)
  );
}

function officialRelationshipRow(
  username: string,
  title: string,
  timestamp: number,
): string {
  return JSON.stringify({
    title,
    string_list_data: [
      {
        href: `https://www.instagram.com/_u/${username}`,
        value: username,
        timestamp,
      },
    ],
  });
}

function validateRealisticJson(
  followerJson: string,
  followingJson: string,
  followerCount: number,
  followingCount: number,
): void {
  const parsedFollowers: unknown = JSON.parse(followerJson);
  const parsedFollowing: unknown = JSON.parse(followingJson);
  if (
    !Array.isArray(parsedFollowers) ||
    parsedFollowers.length !== followerCount ||
    !isOfficialRelationshipRow(parsedFollowers[0]) ||
    !isOfficialRelationshipRow(parsedFollowers.at(-1)) ||
    !parsedFollowing ||
    typeof parsedFollowing !== 'object' ||
    !('relationships_following' in parsedFollowing) ||
    !Array.isArray(parsedFollowing.relationships_following) ||
    parsedFollowing.relationships_following.length !== followingCount ||
    !isOfficialRelationshipRow(parsedFollowing.relationships_following[0]) ||
    !isOfficialRelationshipRow(parsedFollowing.relationships_following.at(-1))
  ) {
    throw new Error(
      'Synthetic high-cardinality JSON does not match Instagram schemas.',
    );
  }
}

function realisticArchive(
  followerCount: number,
  followingCount: number,
  mutualCount: number,
  compression: ZipCompression,
): SyntheticArchive {
  if (
    mutualCount > followerCount ||
    mutualCount > followingCount ||
    followerCount < 1 ||
    followingCount < 1
  ) {
    throw new Error('Synthetic relationship counts are inconsistent.');
  }

  const followerRows = Array.from({ length: followerCount }, (_, index) => {
    const username = realisticUsername('f', index);
    return officialRelationshipRow(
      username,
      '',
      realisticTimestamp('f', index),
    );
  });
  const followingRows = Array.from({ length: followingCount }, (_, index) => {
    const isMutual = index < mutualCount;
    const kind = isMutual ? 'f' : 'n';
    const username = realisticUsername(
      kind,
      isMutual ? index : index - mutualCount,
    );
    return officialRelationshipRow(
      username,
      username,
      realisticTimestamp(kind, isMutual ? index : index - mutualCount),
    );
  });
  const followerJson = `[${followerRows.join(',')}]`;
  const followingJson = `{"relationships_following":[${followingRows.join(',')}]}`;
  validateRealisticJson(
    followerJson,
    followingJson,
    followerCount,
    followingCount,
  );

  const followerBytes = strToU8(followerJson);
  const followingBytes = strToU8(followingJson);
  const archiveBytes = zipSync(
    {
      'connections/followers_and_following/followers_1.json': followerBytes,
      'connections/followers_and_following/following.json': followingBytes,
    },
    { level: compression === 'store' ? 0 : 6 },
  );
  const metadata = inspectArchive(archiveBytes);
  const expectedMethod = compression === 'store' ? 0 : 8;
  if (
    metadata.relevantEntries !== 2 ||
    metadata.compressionMethods.some((method) => method !== expectedMethod) ||
    metadata.uncompressedBytes !==
      followerBytes.byteLength + followingBytes.byteLength ||
    metadata.uncompressedBytes > MAX_JSON_TOTAL ||
    metadata.compressedBytes > MAX_COMPRESSED_TOTAL ||
    metadata.entryUncompressedBytes.some((size) => size > MAX_JSON_ENTRY)
  ) {
    throw new Error(
      `Synthetic high-cardinality ZIP does not fit importer limits or method ${expectedMethod} (compressed ${metadata.compressedBytes} B, uncompressed ${metadata.uncompressedBytes} B).`,
    );
  }

  return {
    buffer: Buffer.from(archiveBytes),
    archiveBytes: archiveBytes.byteLength,
    compressedBytes: metadata.compressedBytes,
    uncompressedBytes: metadata.uncompressedBytes,
    entryUncompressedBytes: metadata.entryUncompressedBytes,
    entryCrc32: metadata.entryCrc32,
    compression,
    compressionMethod: expectedMethod,
    counts: {
      followers: followerCount,
      following: followingCount,
      mutuals: mutualCount,
      notBack: followingCount - mutualCount,
    },
  };
}

async function openImportDialog(
  page: Page,
  dialog: Locator,
  archive: SyntheticArchive,
  filename: string,
): Promise<void> {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Lo que cambia. Lo que importa.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Importar datos' }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Archivos de Instagram').setInputFiles({
    name: filename,
    mimeType: 'application/zip',
    buffer: archive.buffer,
  });
  await expect(dialog.getByText(filename, { exact: true })).toBeVisible();
  await dialog.getByLabel('Tu usuario').fill('browser_benchmark');
  await dialog.getByLabel('Fecha de la exportación').fill(importDate);
  await dialog.getByRole('checkbox').first().check();
}

async function measureInstrumentedImport(
  page: Page,
  archive: SyntheticArchive,
  scenario: string,
): Promise<void> {
  const result = await page.evaluate(async () => {
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="Archivos de Instagram"]',
    );
    const file = input?.files?.[0];
    if (!file) throw new Error('Synthetic benchmark file is not selected.');

    const importerUrl = new URL('/lib/importer.ts', location.origin).href;
    const relationshipsUrl = new URL(
      '/lib/relationships.ts',
      location.origin,
    ).href;
    const { importFiles } = await import(/* @vite-ignore */ importerUrl);
    const { analyze } = await import(/* @vite-ignore */ relationshipsUrl);
    const measurements: {
      stage: string;
      durationMs: number;
      counters?: Record<string, number>;
    }[] = [];
    const startedAt = performance.now();
    const imported = await importFiles(
      [file],
      (measurement: {
        stage: string;
        durationMs: number;
        counters?: Record<string, number>;
      }) => measurements.push(measurement),
    );
    const importWallMs = performance.now() - startedAt;

    const analyzeStartedAt = performance.now();
    const relationships = analyze({
      id: 'synthetic-browser-benchmark',
      account: 'synthetic',
      date: '2020-01-02',
      importedAt: '2020-01-02T00:00:00.000Z',
      followers: imported.followers,
      following: imported.following,
    });
    const analyzeWallMs = performance.now() - analyzeStartedAt;
    return {
      importWallMs,
      analyzeWallMs,
      measurements,
      counts: {
        followers: imported.followers.length,
        following: imported.following.length,
        mutuals: relationships.mutuals.length,
        notBack: relationships.notBack.length,
      },
    };
  });
  expect(result.counts).toEqual(archive.counts);

  const stages = new Map<
    string,
    { calls: number; durationMs: number; counters: Record<string, number> }
  >();
  for (const measurement of result.measurements) {
    const stage = stages.get(measurement.stage) ?? {
      calls: 0,
      durationMs: 0,
      counters: {},
    };
    stage.calls++;
    stage.durationMs += measurement.durationMs;
    for (const [counter, value] of Object.entries(measurement.counters ?? {}))
      stage.counters[counter] = (stage.counters[counter] ?? 0) + value;
    stages.set(measurement.stage, stage);
  }

  console.log(
    JSON.stringify({
      scenario,
      run: 'instrumented-browser-importFiles',
      syntheticOnly: true,
      compression: archive.compression,
      declaredZipMethod: archive.compressionMethod,
      archiveBytes: archive.archiveBytes,
      relevantCompressedBytes: archive.compressedBytes,
      relevantUncompressedBytes: archive.uncompressedBytes,
      relevantEntryUncompressedBytes: archive.entryUncompressedBytes,
      compressedToUncompressedRatio: Number(
        (archive.compressedBytes / archive.uncompressedBytes).toFixed(4),
      ),
      instrumentedImportWallMs: Number(result.importWallMs.toFixed(2)),
      analyzeWallMs: Number(result.analyzeWallMs.toFixed(2)),
      expectedCounts: archive.counts,
      actualCounts: result.counts,
      stages: Object.fromEntries(
        [...stages].map(([name, stage]) => [
          name,
          {
            calls: stage.calls,
            durationMs: Number(stage.durationMs.toFixed(2)),
            counters: stage.counters,
          },
        ]),
      ),
      note:
        'Stage clocks run in Chromium; instrumentation and callbacks add overhead. Overlapping measurements (DEFLATE and output collection) must not be summed.',
    }),
  );
}

async function installBrowserMetrics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state: BrowserBenchmarkState = {
      longTasksSupported: false,
      longTasks: [],
      startedAt: null,
      finishedAt: null,
      outcome: null,
      memoryBeforeBytes: null,
      jsonParseMs: 0,
      jsonParseCount: 0,
      observer: null,
    };
    const readHeap = () =>
      (
        performance as Performance & {
          memory?: { usedJSHeapSize: number };
        }
      ).memory?.usedJSHeapSize ?? null;
    window.__followLensBenchmark = state;
    const parseJson = JSON.parse;
    JSON.parse = (text, reviver) => {
      const startedAt = performance.now();
      try {
        return parseJson(text, reviver);
      } finally {
        if (state.startedAt !== null && state.finishedAt === null) {
          state.jsonParseMs += performance.now() - startedAt;
          state.jsonParseCount += 1;
        }
      }
    };

    if (
      typeof PerformanceObserver !== 'undefined' &&
      PerformanceObserver.supportedEntryTypes?.includes('longtask')
    ) {
      try {
        state.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            state.longTasks.push({
              startTime: entry.startTime,
              duration: entry.duration,
            });
        });
        state.observer.observe({ entryTypes: ['longtask'] });
        state.longTasksSupported = true;
      } catch {
        state.observer?.disconnect();
        state.observer = null;
      }
    }

    document.addEventListener(
      'click',
      (event) => {
        const target = event.target;
        const button =
          target instanceof Element ? target.closest('button') : null;
        if (!button?.textContent?.includes('Analizar importación')) return;
        state.startedAt = performance.now();
        state.finishedAt = null;
        state.outcome = null;
        state.memoryBeforeBytes = readHeap();
      },
      true,
    );

    const recordCompletion = () => {
      if (state.startedAt === null || state.outcome !== null) return;
      const dialog = document.querySelector('[role="dialog"]');
      const success = [...document.querySelectorAll('[role="status"]')].some(
        (element) =>
          !dialog?.contains(element) &&
          element.textContent?.includes('Importación lista.'),
      );
      const failure = dialog?.querySelector('[role="alert"]');
      if (success || failure) {
        state.finishedAt = performance.now();
        state.outcome = success ? 'success' : 'error';
      }
    };
    new MutationObserver(recordCompletion).observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  });
}

async function preparePage(page: Page): Promise<BrowserSignals> {
  await installBrowserMetrics(page);
  const signals = monitorBrowser(page);
  return signals;
}

async function readBrowserMetrics(
  page: Page,
  expectedOutcome: Exclude<BrowserOutcome, null>,
) {
  return page.evaluate((outcome) => {
    const state = window.__followLensBenchmark;
    if (
      !state ||
      state.startedAt === null ||
      state.finishedAt === null ||
      state.outcome !== outcome
    ) {
      throw new Error('Browser benchmark did not observe the expected result.');
    }
    if (state.observer) {
      for (const entry of state.observer.takeRecords())
        state.longTasks.push({
          startTime: entry.startTime,
          duration: entry.duration,
        });
    }
    const measuredTasks = state.longTasks.filter(
      (task) =>
        task.startTime >= state.startedAt! &&
        task.startTime <= state.finishedAt!,
    );
    const memoryAfterBytes = (
      performance as Performance & {
        memory?: { usedJSHeapSize: number };
      }
    ).memory?.usedJSHeapSize ?? null;
    return {
      outcome: state.outcome,
      appElapsedMs: Number((state.finishedAt - state.startedAt).toFixed(2)),
      jsonParseCount: state.jsonParseCount,
      jsonParseMs: Number(state.jsonParseMs.toFixed(2)),
      jsHeapBeforeBytes: state.memoryBeforeBytes,
      jsHeapAfterBytes: memoryAfterBytes,
      longTasksSupported: state.longTasksSupported,
      longTaskCount: state.longTasksSupported ? measuredTasks.length : null,
      longestTaskMs: state.longTasksSupported
        ? Number(
            Math.max(0, ...measuredTasks.map((task) => task.duration)).toFixed(
              2,
            ),
          )
        : null,
      totalLongTaskMs: state.longTasksSupported
        ? Number(
            measuredTasks
              .reduce((total, task) => total + task.duration, 0)
              .toFixed(2),
          )
        : null,
    };
  }, expectedOutcome);
}

function summarizeCpuProfile(profile: CpuProfile) {
  const selfByNode = new Map<number, number>();
  let sampledCpuMs = 0;
  for (let index = 0; index < (profile.samples?.length ?? 0); index++) {
    const deltaMs = (profile.timeDeltas?.[index] ?? 0) / 1000;
    const nodeId = profile.samples![index];
    selfByNode.set(nodeId, (selfByNode.get(nodeId) ?? 0) + deltaMs);
    sampledCpuMs += deltaMs;
  }

  const nodesById = new Map(profile.nodes.map((node) => [node.id, node]));
  const parentById = new Map<number, number>();
  for (const node of profile.nodes)
    for (const child of node.children ?? []) parentById.set(child, node.id);

  const sourcePath = (node: CpuProfileNode) =>
    node.callFrame.url
      ? new URL(node.callFrame.url, appAddress).pathname
      : '(V8 runtime)';
  const frameKey = (node: CpuProfileNode) =>
    `${node.callFrame.functionName}|${sourcePath(node)}|${node.callFrame.lineNumber + 1}`;
  const callersByFrame = new Map<string, Set<string>>();
  for (const node of profile.nodes) {
    if (!(selfByNode.get(node.id) ?? 0)) continue;
    const parent = nodesById.get(parentById.get(node.id) ?? -1);
    if (!parent) continue;
    const callers = callersByFrame.get(frameKey(node)) ?? new Set<string>();
    callers.add(`${parent.callFrame.functionName || '(anonymous)'} ${sourcePath(parent)}`);
    callersByFrame.set(frameKey(node), callers);
  }

  const rows = new Map<string, CpuProfileRow>();
  const ensureRow = (node: CpuProfileNode) => {
    const { functionName, lineNumber } = node.callFrame;
    const source = sourcePath(node);
    const key = frameKey(node);
    const row = rows.get(key) ?? {
      functionName: functionName || '(anonymous)',
      source,
      line: lineNumber + 1,
      selfMs: 0,
      inclusiveMs: 0,
    };
    rows.set(key, row);
    return row;
  };

  for (const node of profile.nodes) {
    ensureRow(node).selfMs += selfByNode.get(node.id) ?? 0;
  }

  for (const node of profile.nodes) {
    const selfMs = selfByNode.get(node.id) ?? 0;
    if (!selfMs) continue;
    let ancestorId: number | undefined = node.id;
    while (ancestorId !== undefined) {
      const ancestor = nodesById.get(ancestorId);
      if (!ancestor) break;
      ensureRow(ancestor).inclusiveMs += selfMs;
      ancestorId = parentById.get(ancestorId);
    }
  }

  const allRows = [...rows.values()];
  const topSelfRows = allRows.filter((row) => row.selfMs > 0);
  const targets = allRows.filter((row) =>
    (row.selfMs > 0 || row.inclusiveMs > 0) &&
      /readZipSelective|decompressDeflate|crc32|strFromU8|parseRelationships|normalize|analyze|JSON\.parse|inflt|inflate|cbuf|slc|decode|sort/i.test(
        row.functionName,
      ),
  );
  return {
    profiler: 'Chrome DevTools Protocol Profiler; sampled CPU time from timeDeltas',
    sampleCount: profile.samples?.length ?? 0,
    sampledProfileMs: Number(sampledCpuMs.toFixed(2)),
    note: 'Self time is exclusive sampled time; inclusive time includes descendants. Percentages use the full sampled profile interval, including idle and harness scheduling, and inclusive values must not be added to self totals.',
    targetFunctions: targets
      .sort((a, b) => b.selfMs - a.selfMs)
      .slice(0, 30)
      .map((row) => ({
        ...row,
        callers: [...(callersByFrame.get(
            `${row.functionName === '(anonymous)' ? '' : row.functionName}|${row.source}|${row.line}`,
        ) ?? [])].slice(0, 5),
        selfMs: Number(row.selfMs.toFixed(2)),
        inclusiveMs: Number(row.inclusiveMs.toFixed(2)),
        selfProfileIntervalPercent:
          sampledCpuMs > 0
            ? Number(((row.selfMs / sampledCpuMs) * 100).toFixed(1))
            : 0,
      })),
    topSelfFunctions: topSelfRows
      .sort((a, b) => b.selfMs - a.selfMs)
      .slice(0, 20)
      .map((row) => ({
        ...row,
        selfMs: Number(row.selfMs.toFixed(2)),
        inclusiveMs: Number(row.inclusiveMs.toFixed(2)),
        selfProfileIntervalPercent:
          sampledCpuMs > 0
            ? Number(((row.selfMs / sampledCpuMs) * 100).toFixed(1))
            : 0,
      })),
  };
}

async function withOptionalCpuProfile<T>(
  page: Page,
  action: () => Promise<T>,
): Promise<{ result: T; profileSummary: ReturnType<typeof summarizeCpuProfile> | null }> {
  if (process.env.FOLLOWLENS_CPU_PROFILE !== '1')
    return { result: await action(), profileSummary: null };

  const session = await page.context().newCDPSession(page);
  let profilerRunning = false;
  try {
    await session.send('Profiler.enable');
    await session.send('Profiler.setSamplingInterval', { interval: 1000 });
    await session.send('Profiler.start');
    profilerRunning = true;
    const result = await action();
    const response = await session.send('Profiler.stop');
    profilerRunning = false;
    return {
      result,
      profileSummary: summarizeCpuProfile(response.profile as CpuProfile),
    };
  } finally {
    if (profilerRunning) await session.send('Profiler.stop');
    await session.send('Profiler.disable');
    await session.detach();
  }
}

async function beginImport(dialog: Locator): Promise<number> {
  const startedAt = nodePerformance.now();
  await dialog.getByRole('button', { name: 'Analizar importación' }).click();
  return startedAt;
}

async function submitAndWaitForOutcome(
  page: Page,
  dialog: Locator,
): Promise<{ harnessObservedMs: number; profileSummary: ReturnType<typeof summarizeCpuProfile> | null }> {
  const submitButton = dialog.getByRole('button', {
    name: 'Analizar importación',
  });
  const profiling = process.env.FOLLOWLENS_CPU_PROFILE === '1';
  if (profiling) await submitButton.scrollIntoViewIfNeeded();

  const profiled = await withOptionalCpuProfile(page, async () => {
    const harnessStart = nodePerformance.now();
    if (profiling) {
      await page.evaluate(() => {
        const button = [...document.querySelectorAll('button')].find(
          (candidate) =>
            candidate.textContent?.includes('Analizar importación'),
        );
        if (!button) throw new Error('Import submit button is not available.');
        button.click();
      });
      await page.waitForFunction(
        () => window.__followLensBenchmark?.outcome !== null,
        null,
        { timeout: 120_000 },
      );
    } else {
      await submitButton.click();
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole('status').filter({ hasText: 'Importación lista.' }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(() => window.__followLensBenchmark?.outcome ?? null),
        )
        .toBe('success');
    }
    return nodePerformance.now() - harnessStart;
  });
  return {
    harnessObservedMs: profiled.result,
    profileSummary: profiled.profileSummary,
  };
}

function logMetrics(
  scenario: string,
  page: Page,
  archive: SyntheticArchive,
  measurements: Awaited<ReturnType<typeof readBrowserMetrics>>,
  harnessObservedMs: number,
  actualCounts: RelationshipCounts | null,
): void {
  console.log(
    JSON.stringify({
      scenario,
      syntheticOnly: true,
      nodeVersion: process.version,
      chromiumVersion: page.context().browser()?.version() ?? 'unknown',
      archiveBytes: archive.archiveBytes,
      relevantCompressedBytes: archive.compressedBytes,
      relevantUncompressedBytes: archive.uncompressedBytes,
      relevantEntryUncompressedBytes: archive.entryUncompressedBytes,
      compressedToUncompressedRatio: Number(
        (archive.compressedBytes / archive.uncompressedBytes).toFixed(4),
      ),
      compression: archive.compression,
      declaredZipMethod: archive.compressionMethod,
      expectedCounts: archive.counts,
      actualCounts,
      ...measurements,
      harnessObservedMs: Number(harnessObservedMs.toFixed(2)),
      harnessInterval:
        'Node timer from Playwright click start until its UI assertion resolves; includes test-runner round trips.',
      appInterval:
        'Chromium timer from the actual submit click event until MutationObserver sees the success result or controlled alert.',
      memoryNote:
        'performance.memory is optional, Chromium-specific JavaScript heap only; null means unavailable and is not process memory.',
    }),
  );
}

function logCpuProfile(
  scenario: string,
  profileSummary: ReturnType<typeof summarizeCpuProfile> | null,
): void {
  if (profileSummary)
    console.log(JSON.stringify({ scenario, cpuProfile: profileSummary }));
}

async function assertDashboardCounts(
  page: Page,
  expected: RelationshipCounts,
): Promise<RelationshipCounts> {
  await expect(
    page.getByRole('heading', { name: 'Tus relaciones.' }),
  ).toBeVisible();
  const summary = page.getByRole('region', { name: 'Resumen de relaciones' });
  const formatCount = (value: number) => value.toLocaleString('es-UY');
  await expect(summary.getByRole('button').nth(0).locator('strong')).toHaveText(
    formatCount(expected.followers),
  );
  await expect(summary.getByRole('button').nth(1).locator('strong')).toHaveText(
    formatCount(expected.following),
  );
  await expect(summary.getByRole('button').nth(2).locator('strong')).toHaveText(
    formatCount(expected.mutuals),
  );
  await expect(
    summary.getByText(
      `${formatCount(expected.mutuals)} de ${formatCount(expected.following)} cuentas que seguís`,
    ),
  ).toBeVisible();
  const list = page.getByRole('region', { name: 'Listado de cuentas' });
  const footerText = expected.notBack
    ? `1–${Math.min(12, expected.notBack)} de ${formatCount(expected.notBack)} cuentas`
    : '0 cuentas';
  const footer = list.locator('.table-footer > span');
  await expect(footer).toHaveText(footerText);
  const parseCount = (value: string) =>
    Number(value.replace(/[^\d]/g, ''));
  const footerCount =
    /de ([\d.]+) cuentas/.exec(await footer.innerText())?.[1] ?? '0';
  return {
    followers: parseCount(
      await summary.getByRole('button').nth(0).locator('strong').innerText(),
    ),
    following: parseCount(
      await summary.getByRole('button').nth(1).locator('strong').innerText(),
    ),
    mutuals: parseCount(
      await summary.getByRole('button').nth(2).locator('strong').innerText(),
    ),
    notBack: parseCount(footerCount),
  };
}

function jsonZip(followers: string[], following: string[]): SyntheticArchive {
  return makeRelationshipZip(followers, following);
}

test('measures medium synthetic relationship import and compares compression methods', async ({
  page,
}) => {
  const signals = await preparePage(page);
  const dialog = page.getByRole('dialog', { name: 'Una nueva perspectiva' });
  const compressionVariants: ZipCompression[] =
    process.env.FOLLOWLENS_CPU_PROFILE === '1'
      ? ['deflate']
      : ['deflate', 'store'];
  for (const compression of compressionVariants) {
    const archive = mediumArchive(compression);
    const scenario = `medium-json-${compression}-zip-ui`;
    await openImportDialog(
      page,
      dialog,
      archive,
      `synthetic-medium-${compression}.zip`,
    );
    await measureInstrumentedImport(page, archive, scenario);

    const profiled = await submitAndWaitForOutcome(page, dialog);
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('status').filter({ hasText: 'Importación lista.' }),
    ).toBeVisible();
    const measurements = await readBrowserMetrics(page, 'success');
    const actualCounts = await assertDashboardCounts(page, archive.counts);
    logMetrics(
      scenario,
      page,
      archive,
      measurements,
      profiled.harnessObservedMs,
      actualCounts,
    );
    logCpuProfile(scenario, profiled.profileSummary);
  }
  assertNoExternalTrafficOrErrors(signals);
});

test('benchmarks realistic high-cardinality relationship imports in Chromium', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const signals = await preparePage(page);
  const dialog = page.getByRole('dialog', { name: 'Una nueva perspectiva' });
  const scenarios = [
    {
      name: 'representative-medium',
      followerCount: 5_000,
      followingCount: 4_000,
      mutualCount: 2_500,
    },
    {
      name: 'high-cardinality',
      followerCount: 30_000,
      followingCount: 24_000,
      mutualCount: 15_000,
    },
    {
      name: 'largest-valid-near-limit',
      followerCount: 114_000,
      followingCount: 90_000,
      mutualCount: 56_250,
    },
  ] as const;
  const compressionVariants: ZipCompression[] =
    process.env.FOLLOWLENS_CPU_PROFILE === '1'
      ? ['deflate']
      : ['deflate', 'store'];

  for (const fixture of scenarios) {
    for (const compression of compressionVariants) {
      const archive = realisticArchive(
        fixture.followerCount,
        fixture.followingCount,
        fixture.mutualCount,
        compression,
      );
      expect(archive.entryUncompressedBytes).toHaveLength(2);
      expect(
        archive.entryUncompressedBytes.every((size) => size <= MAX_JSON_ENTRY),
      ).toBe(true);
      expect(archive.uncompressedBytes).toBeLessThanOrEqual(MAX_JSON_TOTAL);
      expect(archive.compressedBytes).toBeLessThanOrEqual(MAX_COMPRESSED_TOTAL);

      const scenario = `${fixture.name}-realistic-json-${compression}-zip-ui`;
      await openImportDialog(
        page,
        dialog,
        archive,
        `synthetic-${fixture.name}-${compression}.zip`,
      );
      await measureInstrumentedImport(page, archive, scenario);

      const profiled = await submitAndWaitForOutcome(page, dialog);
      await expect(dialog).toBeHidden();
      await expect(
        page.getByRole('status').filter({ hasText: 'Importación lista.' }),
      ).toBeVisible();
      const measurements = await readBrowserMetrics(page, 'success');
      const actualCounts = await assertDashboardCounts(page, archive.counts);
      logMetrics(
        scenario,
        page,
        archive,
        measurements,
        profiled.harnessObservedMs,
        actualCounts,
      );
      logCpuProfile(scenario, profiled.profileSummary);
    }
  }
  assertNoExternalTrafficOrErrors(signals);
});

test('compares the current importer with the direct-set parser prototype', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const signals = await preparePage(page);
  const dialog = page.getByRole('dialog', { name: 'Una nueva perspectiva' });
  const scenarios = [
    {
      name: 'representative-medium',
      followerCount: 5_000,
      followingCount: 4_000,
      mutualCount: 2_500,
    },
    {
      name: 'high-cardinality',
      followerCount: 30_000,
      followingCount: 24_000,
      mutualCount: 15_000,
    },
    {
      name: 'largest-valid-near-limit',
      followerCount: 114_000,
      followingCount: 90_000,
      mutualCount: 56_250,
    },
  ] as const;

  for (const fixture of scenarios) {
    const archive = realisticArchive(
      fixture.followerCount,
      fixture.followingCount,
      fixture.mutualCount,
      'deflate',
    );
    await openImportDialog(
      page,
      dialog,
      archive,
      `synthetic-optimization-${fixture.name}.zip`,
    );

    const measurements = await page.evaluate(async (expectedCounts) => {
      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Archivos de Instagram"]',
      );
      const file = input?.files?.[0];
      if (!file) throw new Error('Synthetic benchmark file is not selected.');

      const importerUrl = new URL('/lib/importer.ts', location.origin).href;
      const zipUrl = new URL('/lib/zip.ts', location.origin).href;
      const relationshipsUrl = new URL(
        '/lib/relationships.ts',
        location.origin,
      ).href;
      const fflateUrl = new URL('/node_modules/fflate/esm/browser.js', location.origin)
        .href;
      const [
        { importFiles },
        { readZipSelective },
        relationships,
        { strFromU8 },
      ] = await Promise.all([
        import(/* @vite-ignore */ importerUrl),
        import(/* @vite-ignore */ zipUrl),
        import(/* @vite-ignore */ relationshipsUrl),
        import(/* @vite-ignore */ fflateUrl),
      ]);
      const { fileInfo, normalize } = relationships;
      type Imported = {
        followers: string[];
        following: string[];
        fileCount: number;
      };
      type Measurement = {
        stage: string;
        durationMs: number;
        counters?: Record<string, number>;
      };
      type Trial = {
        variant: 'current' | 'direct-set-prototype';
        durationMs: number;
        stageDurations: Record<string, number>;
        counts: { followers: number; following: number };
        longTaskCount: number | null;
        longestTaskMs: number | null;
        heapBeforeBytes: number | null;
        heapAfterBytes: number | null;
      };

      const aggregate = (stages: Measurement[]) =>
        Object.fromEntries(
          stages.reduce((totals, measurement) => {
            totals.set(
              measurement.stage,
              (totals.get(measurement.stage) ?? 0) + measurement.durationMs,
            );
            return totals;
          }, new Map<string, number>()),
        );
      const heapBytes = () =>
        (
          performance as Performance & {
            memory?: { usedJSHeapSize: number };
          }
        ).memory?.usedJSHeapSize ?? null;
      const readLongTasks = (start: number, end: number) => {
        const state = window.__followLensBenchmark;
        if (!state?.longTasksSupported) return null;
        return state.longTasks.filter(
          (task) => task.startTime >= start && task.startTime < end,
        );
      };
      const summarize = (tasks: LongTaskSample[] | null) => ({
        longTaskCount: tasks?.length ?? null,
        longestTaskMs: tasks?.length
          ? Number(Math.max(...tasks.map((task) => task.duration)).toFixed(2))
          : tasks
            ? 0
            : null,
      });

      const parseInto = (
        data: unknown,
        kind: 'followers' | 'following',
        target: Set<string>,
      ) => {
        const key =
          kind === 'followers'
            ? 'relationships_followers'
            : 'relationships_following';
        const rows = Array.isArray(data)
          ? data
          : data && typeof data === 'object'
            ? (data as Record<string, unknown>)[key]
            : undefined;
        if (!Array.isArray(rows))
          throw new Error('Synthetic relationship JSON schema is invalid.');
        for (const value of rows) {
          if (!value || typeof value !== 'object')
            throw new Error('Synthetic relationship record is invalid.');
          const row = value as Record<string, unknown>;
          const records = Array.isArray(row.string_list_data)
            ? row.string_list_data
            : [];
          const first = records[0] as
            | { value?: unknown; href?: unknown }
            | undefined;
          let name = normalize(first?.value) ?? normalize(row.title);
          if (!name && typeof first?.href === 'string') {
            try {
              const url = new URL(first.href);
              if (
                ['www.instagram.com', 'instagram.com'].includes(url.hostname)
              ) {
                const parts = url.pathname.split('/').filter(Boolean);
                name = normalize(parts[0] === '_u' ? parts[1] : parts[0]);
              }
            } catch {
              // Match the production parser's fallback behavior for invalid URLs.
            }
          }
          if (!name)
            throw new Error('Synthetic relationship username is invalid.');
          target.add(name);
        }
      };

      const current = async (): Promise<{
        imported: Imported;
        stages: Record<string, number>;
      }> => {
        const stages: Measurement[] = [];
        const imported = await importFiles(
          [file],
          (measurement: Measurement) => stages.push(measurement),
        );
        return { imported, stages: aggregate(stages) };
      };
      const directSetPrototype = async (): Promise<{
        imported: Imported;
        stages: Record<string, number>;
      }> => {
        const stages: Measurement[] = [];
        const imported: Imported = {
          followers: [],
          following: [],
          fileCount: 0,
        };
        const names = {
          followers: new Set<string>(),
          following: new Set<string>(),
        };
        const totalStartedAt = performance.now();
        const entries = await readZipSelective(
          file,
          (path: string) => fileInfo(path) !== null,
          (measurement: Measurement) => stages.push(measurement),
        );
        let followersFound = false;
        let followingFound = false;
        for (const [path, rawBytes] of Object.entries(entries)) {
          const info = fileInfo(path);
          if (!info || info.format !== 'json')
            throw new Error('Synthetic benchmark archive format is invalid.');
          const kind = info.kind as 'followers' | 'following';
          const bytes = rawBytes as Uint8Array;
          const base = path.replaceAll('\\', '/').split('/').pop()!;
          const decodeStartedAt = performance.now();
          const jsonText = strFromU8(bytes).replace(/^\uFEFF/, '');
          stages.push({
            stage: 'utf8-decode',
            durationMs: performance.now() - decodeStartedAt,
            counters: { inputBytes: bytes.byteLength },
          });
          const parseStartedAt = performance.now();
          const data: unknown = JSON.parse(jsonText);
          stages.push({
            stage: 'json-parse',
            durationMs: performance.now() - parseStartedAt,
            counters: { inputBytes: bytes.byteLength },
          });
          const transformStartedAt = performance.now();
          parseInto(data, kind, names[kind]);
          stages.push({
            stage: 'direct-set-relationship-parse',
            durationMs: performance.now() - transformStartedAt,
            counters: { parsedRows: names[kind].size },
          });
          if (kind === 'followers') {
            if (base !== 'followers_1.json')
              throw new Error('Synthetic follower part is unexpected.');
            followersFound = true;
          } else {
            if (base !== 'following.json')
              throw new Error('Synthetic following filename is unexpected.');
            followingFound = true;
          }
        }
        if (!followersFound || !followingFound)
          throw new Error('Synthetic benchmark lists are incomplete.');
        const finalizeStartedAt = performance.now();
        imported.followers = [...names.followers].sort();
        imported.following = [...names.following].sort();
        imported.fileCount = Object.keys(entries).length;
        stages.push({
          stage: 'direct-set-result-finalization',
          durationMs: performance.now() - finalizeStartedAt,
          counters: {
            followers: imported.followers.length,
            following: imported.following.length,
            fileCount: imported.fileCount,
          },
        });
        stages.push({
          stage: 'direct-set-import-total',
          durationMs: performance.now() - totalStartedAt,
          counters: {
            followers: imported.followers.length,
            following: imported.following.length,
            fileCount: imported.fileCount,
          },
        });
        return { imported, stages: aggregate(stages) };
      };

      const sameResult = (left: Imported, right: Imported) =>
        left.fileCount === right.fileCount &&
        left.followers.length === right.followers.length &&
        left.following.length === right.following.length &&
        left.followers.every((name, index) => name === right.followers[index]) &&
        left.following.every((name, index) => name === right.following[index]);
      const counts = (imported: Imported) => {
        const followingSet = new Set(imported.following);
        const mutuals = imported.followers.filter((name) =>
          followingSet.has(name),
        ).length;
        return {
          followers: imported.followers.length,
          following: imported.following.length,
          mutuals,
          notBack: imported.following.length - mutuals,
        };
      };
      const assertExpectedCounts = (actual: ReturnType<typeof counts>) => {
        if (
          actual.followers !== expectedCounts.followers ||
          actual.following !== expectedCounts.following ||
          actual.mutuals !== expectedCounts.mutuals ||
          actual.notBack !== expectedCounts.notBack
        ) {
          throw new Error('Importer variant returned unexpected relationship counts.');
        }
      };
      const trials: Trial[] = [];
      let reference: Imported | null = null;
      const runCurrent = async () => {
        const startedAt = performance.now();
        const heapBeforeBytes = heapBytes();
        const result = await current();
        const finishedAt = performance.now();
        const tasks = readLongTasks(startedAt, finishedAt);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const state = window.__followLensBenchmark;
        if (state?.longTasksSupported) {
          for (const task of state.observer?.takeRecords() ?? [])
            state.longTasks.push({
              startTime: task.startTime,
              duration: task.duration,
            });
        }
        const observedTasks = readLongTasks(startedAt, finishedAt) ?? tasks;
        if (reference && !sameResult(reference, result.imported))
          throw new Error('Current importer output changed between trials.');
        reference ??= result.imported;
        const actualCounts = counts(result.imported);
        assertExpectedCounts(actualCounts);
        return {
          variant: 'current' as const,
          durationMs: finishedAt - startedAt,
          stageDurations: result.stages,
          counts: actualCounts,
          ...summarize(observedTasks),
          heapBeforeBytes,
          heapAfterBytes: heapBytes(),
        };
      };
      const runPrototype = async () => {
        const startedAt = performance.now();
        const heapBeforeBytes = heapBytes();
        const result = await directSetPrototype();
        const finishedAt = performance.now();
        const tasks = readLongTasks(startedAt, finishedAt);
        await new Promise((resolve) => setTimeout(resolve, 0));
        const state = window.__followLensBenchmark;
        if (state?.longTasksSupported) {
          for (const task of state.observer?.takeRecords() ?? [])
            state.longTasks.push({
              startTime: task.startTime,
              duration: task.duration,
            });
        }
        const observedTasks = readLongTasks(startedAt, finishedAt) ?? tasks;
        if (reference && !sameResult(reference, result.imported))
          throw new Error('Prototype output differs from current importer.');
        reference ??= result.imported;
        const actualCounts = counts(result.imported);
        assertExpectedCounts(actualCounts);
        return {
          variant: 'direct-set-prototype' as const,
          durationMs: finishedAt - startedAt,
          stageDurations: result.stages,
          counts: actualCounts,
          ...summarize(observedTasks),
          heapBeforeBytes,
          heapAfterBytes: heapBytes(),
        };
      };

      await runCurrent();
      await runPrototype();
      for (let repetition = 0; repetition < 3; repetition++) {
        const pair =
          repetition % 2 === 0
            ? [await runCurrent(), await runPrototype()]
            : [await runPrototype(), await runCurrent()];
        trials.push(...pair);
      }
      return trials.map((trial) => ({
        ...trial,
        durationMs: Number(trial.durationMs.toFixed(2)),
        longestTaskMs:
          trial.longestTaskMs === null
            ? null
            : Number(trial.longestTaskMs.toFixed(2)),
      }));
    }, archive.counts);

    for (const trial of measurements)
      console.log(
        JSON.stringify({
          scenario: `${fixture.name}-direct-set-parser-experiment`,
          syntheticOnly: true,
          nodeVersion: process.version,
          chromiumVersion: page.context().browser()?.version() ?? 'unknown',
          compression: archive.compression,
          declaredZipMethod: archive.compressionMethod,
          archiveBytes: archive.archiveBytes,
          relevantCompressedBytes: archive.compressedBytes,
          relevantUncompressedBytes: archive.uncompressedBytes,
          expectedCounts: archive.counts,
          actualCounts: trial.counts,
          ...trial,
          trialCountPerVariant: 3,
          note:
            'Import wall time and long tasks are measured inside Chromium; fixture construction is outside the timed interval. The prototype is benchmark-only and reuses the production ZIP reader, output limits, and CRC32.',
        }),
      );
  }
  assertNoExternalTrafficOrErrors(signals);
});

test('benchmarks CRC32 slicing-by-8 against production reference', async ({
  page,
}) => {
  test.setTimeout(600_000);
  const signals = await preparePage(page);
  const scenarios = [
    {
      name: 'representative-medium',
      followerCount: 5_000,
      followingCount: 4_000,
      mutualCount: 2_500,
    },
    {
      name: 'high-cardinality',
      followerCount: 30_000,
      followingCount: 24_000,
      mutualCount: 15_000,
    },
    {
      name: 'largest-valid-near-limit',
      followerCount: 114_000,
      followingCount: 90_000,
      mutualCount: 56_250,
    },
  ] as const;
  const entryMeasurements: Array<{
    scenario: string;
    entry: string;
    bytes: number;
    expectedCrc32: number;
    productionMs: number[];
    slicingBy8Ms: number[];
    productionMedianMs: number;
    slicingBy8MedianMs: number;
    productionMedianNsPerByte: number;
    slicingBy8MedianNsPerByte: number;
    rangeMs: { production: number; slicingBy8: number };
  }> = [];
  let tableInitializationMs = 0;
  let tableBytes = 0;

  for (const fixture of scenarios) {
    const archive = realisticArchive(
      fixture.followerCount,
      fixture.followingCount,
      fixture.mutualCount,
      'deflate',
    );
    await openImportDialog(
      page,
      page.getByRole('dialog', { name: 'Una nueva perspectiva' }),
      archive,
      `synthetic-crc32-${fixture.name}.zip`,
    );

    const result = await page.evaluate(
      async ({ expectedCrcs, scenarioName }) => {
        const file = document.querySelector<HTMLInputElement>(
          'input[aria-label="Archivos de Instagram"]',
        )?.files?.[0];
        if (!file) throw new Error('Synthetic CRC benchmark file is missing.');
        const zipUrl = new URL('/lib/zip.ts', location.origin).href;
        const relationshipUrl = new URL(
          '/lib/relationships.ts',
          location.origin,
        ).href;
        const slicingUrl = new URL(
          '/tests/perf/crc32-slicing-by-8.ts',
          location.origin,
        ).href;
        const [
          { crc32, readZipSelective },
          { fileInfo },
          { crc32SlicingBy8, tableBytes, tableInitializationMs },
        ] = await Promise.all([
          import(/* @vite-ignore */ zipUrl),
          import(/* @vite-ignore */ relationshipUrl),
          import(/* @vite-ignore */ slicingUrl),
        ]);

        const extracted = await readZipSelective(
          file,
          (path: string) => fileInfo(path) !== null,
        );
        const vectors: Array<{ name: string; bytes: Uint8Array }> = [
          { name: 'empty', bytes: new Uint8Array(0) },
          {
            name: 'known-123456789',
            bytes: new TextEncoder().encode('123456789'),
          },
          {
            name: 'all-byte-values',
            bytes: Uint8Array.from({ length: 256 }, (_, index) => index),
          },
        ];
        for (let length = 1; length <= 17; length++) {
          const backing = Uint8Array.from(
            { length: length + 4 },
            (_, index) => (index * 73 + length * 19) & 0xff,
          );
          vectors.push({
            name: `small-offset-length-${length}`,
            bytes: backing.subarray(2, 2 + length),
          });
        }
        for (let remainder = 0; remainder < 8; remainder++) {
          const backing = new Uint8Array(3 + 65_536 + remainder + 4);
          let state = (0x9e3779b9 ^ remainder) >>> 0;
          for (let index = 0; index < backing.length; index++) {
            state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
            backing[index] = state >>> 24;
          }
          vectors.push({
            name: `offset-3-length-residue-${remainder}`,
            bytes: backing.subarray(3, 3 + 65_536 + remainder),
          });
        }
        const compactJson = new TextEncoder().encode(
          JSON.stringify({
            relationships_following: [
              {
                title: 'synthetic_alpha',
                string_list_data: [{ value: 'synthetic_alpha', timestamp: 1 }],
              },
              {
                title: 'synthetic_beta',
                string_list_data: [{ value: 'synthetic_beta', timestamp: 2 }],
              },
            ],
          }),
        );
        vectors.push({ name: 'compact-json', bytes: compactJson });

        for (const vector of vectors) {
          const expected = crc32(vector.bytes);
          const candidate = crc32SlicingBy8(vector.bytes);
          if (vector.name === 'known-123456789' && expected !== 0xcbf43926)
            throw new Error(
              'Production CRC32 failed the standard known vector.',
            );
          if (candidate !== expected)
            throw new Error(`CRC32 equivalence failed for ${vector.name}.`);
        }

        const median = (values: number[]) => {
          const sorted = [...values].sort((left, right) => left - right);
          return sorted[Math.floor(sorted.length / 2)]!;
        };
        const output: Array<{
          scenario: string;
          entry: string;
          bytes: number;
          expectedCrc32: number;
          productionMs: number[];
          slicingBy8Ms: number[];
          productionMedianMs: number;
          slicingBy8MedianMs: number;
          productionMedianNsPerByte: number;
          slicingBy8MedianNsPerByte: number;
          rangeMs: { production: number; slicingBy8: number };
        }> = [];
        let checksumSink = 0;

        for (const [path, bytes] of Object.entries(
          extracted as Record<string, Uint8Array>,
        ).sort(([a], [b]) => a.localeCompare(b))) {
          const expectedCrc32 = expectedCrcs[path];
          if (expectedCrc32 === undefined)
            throw new Error('Central-directory CRC metadata is missing.');
          const expected = crc32(bytes);
          if (expected !== expectedCrc32)
            throw new Error(
              'Production CRC differs from the ZIP central directory.',
            );

          const warmUp = [crc32, crc32SlicingBy8];
          for (const calculate of warmUp) {
            if (calculate(bytes) !== expectedCrc32)
              throw new Error('CRC warm-up result differs from ZIP metadata.');
          }

          const productionMs: number[] = [];
          const slicingBy8Ms: number[] = [];
          for (let repetition = 0; repetition < 5; repetition++) {
            const order =
              repetition % 2 === 0
                ? ([
                    ['production', crc32, productionMs],
                    ['slicing-by-8', crc32SlicingBy8, slicingBy8Ms],
                  ] as const)
                : ([
                    ['slicing-by-8', crc32SlicingBy8, slicingBy8Ms],
                    ['production', crc32, productionMs],
                  ] as const);
            for (const [, calculate, timings] of order) {
              const startedAt = performance.now();
              const actual = calculate(bytes);
              const elapsedMs = performance.now() - startedAt;
              if (actual !== expectedCrc32)
                throw new Error('Measured CRC differs from ZIP metadata.');
              checksumSink = (checksumSink ^ actual) >>> 0;
              timings.push(elapsedMs);
            }
          }

          const productionMedianMs = median(productionMs);
          const slicingBy8MedianMs = median(slicingBy8Ms);
          output.push({
            scenario: scenarioName,
            entry: path.split('/').pop()!,
            bytes: bytes.byteLength,
            expectedCrc32,
            productionMs: productionMs.map((value) => Number(value.toFixed(3))),
            slicingBy8Ms: slicingBy8Ms.map((value) => Number(value.toFixed(3))),
            productionMedianMs: Number(productionMedianMs.toFixed(3)),
            slicingBy8MedianMs: Number(slicingBy8MedianMs.toFixed(3)),
            productionMedianNsPerByte: Number(
              ((productionMedianMs * 1_000_000) / bytes.byteLength).toFixed(2),
            ),
            slicingBy8MedianNsPerByte: Number(
              ((slicingBy8MedianMs * 1_000_000) / bytes.byteLength).toFixed(2),
            ),
            rangeMs: {
              production: Number(
                (Math.max(...productionMs) - Math.min(...productionMs)).toFixed(
                  3,
                ),
              ),
              slicingBy8: Number(
                (Math.max(...slicingBy8Ms) - Math.min(...slicingBy8Ms)).toFixed(
                  3,
                ),
              ),
            },
          });
        }

        return {
          tableInitializationMs,
          tableBytes,
          equivalenceVectors: vectors.length,
          checksumSink,
          entries: output,
        };
      },
      {
        expectedCrcs: archive.entryCrc32,
        scenarioName: fixture.name,
      },
    );
    tableInitializationMs ||= result.tableInitializationMs;
    tableBytes ||= result.tableBytes;
    expect(result.equivalenceVectors).toBe(29);
    expect(result.entries).toHaveLength(2);
    expect(result.checksumSink).toBeGreaterThanOrEqual(0);
    entryMeasurements.push(...result.entries);
  }

  const nearLimit = entryMeasurements.filter(
    (measurement) => measurement.scenario === 'largest-valid-near-limit',
  );
  const productionNearLimitMs = nearLimit.reduce(
    (total, entry) => total + entry.productionMedianMs,
    0,
  );
  const slicingNearLimitMs = nearLimit.reduce(
    (total, entry) => total + entry.slicingBy8MedianMs,
    0,
  );
  const measuredSpeedup = productionNearLimitMs / slicingNearLimitMs;
  const priorImporterCrcStageMs = { min: 90, max: 101 };
  const theoreticalSavings = [
    priorImporterCrcStageMs.min * (1 - 1 / measuredSpeedup),
    priorImporterCrcStageMs.max * (1 - 1 / measuredSpeedup),
  ];
  const theoreticalImportSavingsMs = {
    min: Number(Math.min(...theoreticalSavings).toFixed(2)),
    max: Number(Math.max(...theoreticalSavings).toFixed(2)),
  };

  console.log(
    JSON.stringify({
      scenario: 'crc32-slicing-by-8-alternative',
      syntheticOnly: true,
      nodeVersion: process.version,
      chromiumVersion: page.context().browser()?.version() ?? 'unknown',
      tableInitializationMs: Number(tableInitializationMs.toFixed(3)),
      candidateTableBytes: tableBytes,
      productionTableBytes: 256 * Uint32Array.BYTES_PER_ELEMENT,
      initializationNote:
        'Candidate table time is captured during module evaluation; production table initialization is not independently observable without changing production code.',
      entryMeasurements,
      nearLimitStandaloneKernelMedianMs: {
        production: Number(productionNearLimitMs.toFixed(3)),
        slicingBy8: Number(slicingNearLimitMs.toFixed(3)),
      },
      priorObservedImporterCrcStageMs: priorImporterCrcStageMs,
      theoreticalImportSavingsMs,
      theoreticalSavingsNote:
        'Estimate only: applies the standalone kernel speed ratio to the prior observed 90-101 ms production CRC stage; the real importer still uses only the production algorithm.',
      repeatCountPerVariantAndEntry: 5,
      fixtureCompression: 'deflate',
      expectedCrcSource: 'ZIP central directory',
    }),
  );
  assertNoExternalTrafficOrErrors(signals);
});

test('benchmarks importer worker responsiveness against main-thread import', async ({
  page,
}) => {
  test.setTimeout(900_000);
  const signals = await preparePage(page);
  const scenarios = [
    {
      name: 'representative-medium',
      followerCount: 5_000,
      followingCount: 4_000,
      mutualCount: 2_500,
    },
    {
      name: 'high-cardinality',
      followerCount: 30_000,
      followingCount: 24_000,
      mutualCount: 15_000,
    },
    {
      name: 'largest-valid-near-limit',
      followerCount: 114_000,
      followingCount: 90_000,
      mutualCount: 56_250,
    },
  ] as const;
  const measurements: Array<Record<string, unknown>> = [];
  const oversizedZipBytes = Uint8Array.from(
    makeBudgetZip(MAX_JSON_TOTAL + 1).buffer,
  );

  for (const fixture of scenarios) {
    const archive = realisticArchive(
      fixture.followerCount,
      fixture.followingCount,
      fixture.mutualCount,
      'deflate',
    );
    await openImportDialog(
      page,
      page.getByRole('dialog', { name: 'Una nueva perspectiva' }),
      archive,
      `synthetic-worker-${fixture.name}.zip`,
    );

    const results = await page.evaluate(
      async ({ scenarioName, expectedCounts, oversizedBytes }) => {
        type Imported = {
          followers: string[];
          following: string[];
          fileCount: number;
        };
        type WorkerSuccess = {
          operationId: string;
          ok: true;
          result: Imported;
          importMs: number;
          workerHeapBeforeBytes: number | null;
          workerHeapAfterBytes: number | null;
        };
        type WorkerFailure = {
          operationId: string;
          ok: false;
          error: string;
        };
        type WorkerResponse = { type: 'ready' } | WorkerSuccess | WorkerFailure;
        type Pending = {
          resolve: (response: WorkerSuccess | WorkerFailure) => void;
          reject: (error: Error) => void;
          timeoutId: number;
        };
        type WorkerClient = {
          worker: Worker;
          readyMs: number;
          request: (file: File) => Promise<{
            response: WorkerSuccess | WorkerFailure;
            roundTripMs: number;
            postMessageCallMs: number;
          }>;
          requestUnanswered: () => Promise<void>;
          close: () => void;
        };
        type TaskSample = { startTime: number; duration: number };
        type ImportMeasurement = {
          scenario: string;
          run: number;
          mode: 'main-thread' | 'worker-warm' | 'worker-cold';
          internalImportMs: number;
          observableMs: number;
          workerCreationMs: number | null;
          postMessageCallMs: number | null;
          roundTripMs: number | null;
          analyzeMs: number;
          importLongTaskCount: number | null;
          importLongestTaskMs: number | null;
          importMaxTimerGapMs: number;
          analyzeLongTaskCount: number | null;
          analyzeLongestTaskMs: number | null;
          analyzeMaxTimerGapMs: number;
          heapBeforeBytes: number | null;
          heapAfterBytes: number | null;
          workerHeapBeforeBytes: number | null;
          workerHeapAfterBytes: number | null;
          counts: {
            followers: number;
            following: number;
            mutuals: number;
            notBack: number;
            fans: number;
          };
        };
        const selectedFile = document.querySelector<HTMLInputElement>(
          'input[aria-label="Archivos de Instagram"]',
        )?.files?.[0];
        if (!selectedFile)
          throw new Error('Synthetic Worker benchmark file is missing.');
        const importerUrl = new URL('/lib/importer.ts', location.origin).href;
        const relationshipsUrl = new URL(
          '/lib/relationships.ts',
          location.origin,
        ).href;
        const workerUrl = new URL(
          '/tests/perf/importer.worker.ts',
          location.origin,
        ).href;
        const [{ importFiles }, { analyze }] = await Promise.all([
          import(/* @vite-ignore */ importerUrl),
          import(/* @vite-ignore */ relationshipsUrl),
        ]);
        let operationNumber = 0;
        let referenceResult: Imported | null = null;
        const sameResult = (left: Imported, right: Imported) =>
          left.fileCount === right.fileCount &&
          left.followers.length === right.followers.length &&
          left.following.length === right.following.length &&
          left.followers.every(
            (name, index) => name === right.followers[index],
          ) &&
          left.following.every(
            (name, index) => name === right.following[index],
          );
        const assertMatchesReference = (result: Imported) => {
          if (referenceResult && !sameResult(referenceResult, result))
            throw new Error(
              'Worker and main-thread relationship arrays differ.',
            );
          referenceResult ??= result;
        };
        const readHeap = () =>
          (
            performance as Performance & {
              memory?: { usedJSHeapSize: number };
            }
          ).memory?.usedJSHeapSize ?? null;
        const drainTasks = async (startTime: number, endTime: number) => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          const state = window.__followLensBenchmark;
          if (state?.longTasksSupported) {
            for (const task of state.observer?.takeRecords() ?? [])
              state.longTasks.push({
                startTime: task.startTime,
                duration: task.duration,
              });
          }
          if (!state?.longTasksSupported) return null;
          return state.longTasks.filter(
            (task) => task.startTime >= startTime && task.startTime < endTime,
          ) as TaskSample[];
        };
        const summarizeTasks = (tasks: TaskSample[] | null) => ({
          count: tasks?.length ?? null,
          maxMs: tasks?.length
            ? Number(Math.max(...tasks.map((task) => task.duration)).toFixed(2))
            : tasks
              ? 0
              : null,
        });
        const measureTimerGap = async <T>(operation: () => T | Promise<T>) => {
          let previousTick = performance.now();
          let maxGapMs = 0;
          const interval = window.setInterval(() => {
            const currentTick = performance.now();
            maxGapMs = Math.max(maxGapMs, currentTick - previousTick);
            previousTick = currentTick;
          }, 16);
          try {
            const result = await operation();
            const elapsedMs = performance.now();
            await new Promise((resolve) => setTimeout(resolve, 20));
            return {
              result,
              elapsedMs,
              maxGapMs: Number(maxGapMs.toFixed(2)),
            };
          } finally {
            window.clearInterval(interval);
          }
        };
        const countsFor = (result: Imported) => {
          const following = new Set(result.following);
          const followers = new Set(result.followers);
          const mutuals = [...followers].filter((name) =>
            following.has(name),
          ).length;
          return {
            followers: result.followers.length,
            following: result.following.length,
            mutuals,
            notBack: result.following.length - mutuals,
            fans: result.followers.length - mutuals,
          };
        };
        const assertCounts = (result: Imported) => {
          const actual = countsFor(result);
          for (const key of Object.keys(expectedCounts) as Array<
            keyof typeof expectedCounts
          >) {
            if (actual[key] !== expectedCounts[key])
              throw new Error('Worker benchmark returned unexpected counts.');
          }
          return actual;
        };
        const runAnalyze = (result: Imported) => {
          const startedAt = performance.now();
          const analyzed = analyze({
            id: 'synthetic-worker-benchmark',
            account: 'synthetic',
            date: '2020-01-02',
            importedAt: '2020-01-02T00:00:00.000Z',
            followers: result.followers,
            following: result.following,
          });
          const elapsedMs = performance.now() - startedAt;
          if (
            analyzed.followers.length !== expectedCounts.followers ||
            analyzed.following.length !== expectedCounts.following ||
            analyzed.mutuals.length !== expectedCounts.mutuals ||
            analyzed.notBack.length !== expectedCounts.notBack ||
            analyzed.fans.length !==
              expectedCounts.followers - expectedCounts.mutuals
          ) {
            throw new Error('Post-import analysis returned unexpected counts.');
          }
          return elapsedMs;
        };
        const createWorker = async (): Promise<WorkerClient> => {
          const creationStartedAt = performance.now();
          const worker = new Worker(workerUrl, { type: 'module' });
          const pending = new Map<string, Pending>();
          let readyResolve: (() => void) | null = null;
          let readyReject: ((error: Error) => void) | null = null;
          let isReady = false;
          let failed = false;
          let readyTimeoutId = 0;
          const ready = new Promise<void>((resolve, reject) => {
            readyResolve = resolve;
            readyReject = reject;
            readyTimeoutId = window.setTimeout(
              () => reject(new Error('Importer Worker startup timed out.')),
              30_000,
            );
          });
          const fail = (error: Error) => {
            if (failed) return;
            failed = true;
            readyReject?.(error);
            for (const request of pending.values()) {
              window.clearTimeout(request.timeoutId);
              request.reject(error);
            }
            pending.clear();
          };
          worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const response = event.data;
            if ('type' in response && response.type === 'ready') {
              isReady = true;
              window.clearTimeout(readyTimeoutId);
              readyResolve?.();
              return;
            }
            if (!('operationId' in response)) return;
            const request = pending.get(response.operationId);
            if (!request) return;
            pending.delete(response.operationId);
            window.clearTimeout(request.timeoutId);
            request.resolve(response);
          };
          worker.onerror = (event) => {
            event.preventDefault();
            fail(new Error('Importer Worker failed unexpectedly.'));
          };
          worker.onmessageerror = () =>
            fail(new Error('Importer Worker response could not be decoded.'));
          try {
            await ready;
          } catch (error) {
            worker.terminate();
            throw error;
          }
          if (!isReady || failed) {
            worker.terminate();
            throw new Error('Importer Worker did not become ready.');
          }
          const readyMs = performance.now() - creationStartedAt;
          return {
            worker,
            readyMs,
            request: async (file) => {
              if (failed)
                throw new Error('Importer Worker is no longer usable.');
              const operationId = `${scenarioName}-${++operationNumber}`;
              const startedAt = performance.now();
              let postMessageCallMs = 0;
              const response = await new Promise<WorkerSuccess | WorkerFailure>(
                (resolve, reject) => {
                  const timeoutId = window.setTimeout(() => {
                    const error = new Error(
                      'Importer Worker did not respond to the operation.',
                    );
                    fail(error);
                    worker.terminate();
                  }, 120_000);
                  pending.set(operationId, { resolve, reject, timeoutId });
                  const postStartedAt = performance.now();
                  try {
                    worker.postMessage({ operationId, file });
                    postMessageCallMs = performance.now() - postStartedAt;
                  } catch (error) {
                    window.clearTimeout(timeoutId);
                    pending.delete(operationId);
                    reject(
                      error instanceof Error
                        ? error
                        : new Error('Could not send the file to the Worker.'),
                    );
                  }
                },
              );
              return {
                response,
                roundTripMs: performance.now() - startedAt,
                postMessageCallMs,
              };
            },
            requestUnanswered: async () => {
              if (failed)
                throw new Error('Importer Worker is no longer usable.');
              const operationId = `${scenarioName}-${++operationNumber}`;
              await new Promise<void>((resolve, reject) => {
                const timeoutId = window.setTimeout(() => {
                  const error = new Error(
                    'Importer Worker did not respond to the operation.',
                  );
                  fail(error);
                  worker.terminate();
                }, 250);
                pending.set(operationId, {
                  resolve: () => resolve(),
                  reject,
                  timeoutId,
                });
                try {
                  worker.postMessage({ operationId });
                } catch (error) {
                  window.clearTimeout(timeoutId);
                  pending.delete(operationId);
                  reject(
                    error instanceof Error
                      ? error
                      : new Error('Could not send the Worker probe.'),
                  );
                }
              });
            },
            close: () => {
              fail(new Error('Importer Worker was terminated.'));
              worker.terminate();
            },
          };
        };
        const mainImport = async (run: number): Promise<ImportMeasurement> => {
          const heapBeforeBytes = readHeap();
          const startedAt = performance.now();
          const measuredImport = await measureTimerGap(() =>
            importFiles([selectedFile]),
          );
          const result = measuredImport.result;
          const finishedAt = measuredImport.elapsedMs;
          assertMatchesReference(result);
          const importTasks = await drainTasks(startedAt, finishedAt);
          const analyzeStartedAt = performance.now();
          const measuredAnalyze = await measureTimerGap(() =>
            runAnalyze(result),
          );
          const analyzeMs = measuredAnalyze.result;
          const analyzeFinishedAt = measuredAnalyze.elapsedMs;
          const analyzeTasks = await drainTasks(
            analyzeStartedAt,
            analyzeFinishedAt,
          );
          return {
            scenario: scenarioName,
            run,
            mode: 'main-thread',
            internalImportMs: finishedAt - startedAt,
            observableMs: finishedAt - startedAt,
            workerCreationMs: null,
            postMessageCallMs: null,
            roundTripMs: null,
            analyzeMs,
            importLongTaskCount: summarizeTasks(importTasks).count,
            importLongestTaskMs: summarizeTasks(importTasks).maxMs,
            importMaxTimerGapMs: measuredImport.maxGapMs,
            analyzeLongTaskCount: summarizeTasks(analyzeTasks).count,
            analyzeLongestTaskMs: summarizeTasks(analyzeTasks).maxMs,
            analyzeMaxTimerGapMs: measuredAnalyze.maxGapMs,
            heapBeforeBytes,
            heapAfterBytes: readHeap(),
            workerHeapBeforeBytes: null,
            workerHeapAfterBytes: null,
            counts: assertCounts(result),
          };
        };
        const workerImport = async (
          client: WorkerClient,
          run: number,
          mode: 'worker-warm' | 'worker-cold',
          coldStartedAt: number | null = null,
        ): Promise<ImportMeasurement> => {
          const heapBeforeBytes = readHeap();
          const startedAt = performance.now();
          const measuredExchange = await measureTimerGap(() =>
            client.request(selectedFile),
          );
          const exchange = measuredExchange.result;
          const receivedAt = measuredExchange.elapsedMs;
          const importTasks = await drainTasks(startedAt, receivedAt);
          if (!exchange.response.ok)
            throw new Error(
              'Valid synthetic Worker import unexpectedly failed.',
            );
          const successfulResponse = exchange.response;
          assertMatchesReference(successfulResponse.result);
          const analyzeStartedAt = performance.now();
          const measuredAnalyze = await measureTimerGap(() =>
            runAnalyze(successfulResponse.result),
          );
          const analyzeMs = measuredAnalyze.result;
          const analyzeFinishedAt = measuredAnalyze.elapsedMs;
          const analyzeTasks = await drainTasks(
            analyzeStartedAt,
            analyzeFinishedAt,
          );
          return {
            scenario: scenarioName,
            run,
            mode,
            internalImportMs: successfulResponse.importMs,
            observableMs:
              coldStartedAt === null
                ? exchange.roundTripMs
                : receivedAt - coldStartedAt,
            workerCreationMs: mode === 'worker-cold' ? client.readyMs : null,
            postMessageCallMs: exchange.postMessageCallMs,
            roundTripMs: exchange.roundTripMs,
            analyzeMs,
            importLongTaskCount: summarizeTasks(importTasks).count,
            importLongestTaskMs: summarizeTasks(importTasks).maxMs,
            importMaxTimerGapMs: measuredExchange.maxGapMs,
            analyzeLongTaskCount: summarizeTasks(analyzeTasks).count,
            analyzeLongestTaskMs: summarizeTasks(analyzeTasks).maxMs,
            analyzeMaxTimerGapMs: measuredAnalyze.maxGapMs,
            heapBeforeBytes,
            heapAfterBytes: readHeap(),
            workerHeapBeforeBytes: successfulResponse.workerHeapBeforeBytes,
            workerHeapAfterBytes: successfulResponse.workerHeapAfterBytes,
            counts: assertCounts(successfulResponse.result),
          };
        };
        const timeoutWorker = await createWorker();
        let noResponseWasHandled = false;
        try {
          await timeoutWorker.requestUnanswered();
        } catch (error) {
          noResponseWasHandled =
            error instanceof Error && error.message.includes('did not respond');
        }
        timeoutWorker.close();
        if (!noResponseWasHandled)
          throw new Error('Worker timeout did not reject a missing response.');
        const warmWorker = await createWorker();
        const invalidFile = new File(
          [new Uint8Array([0, 1, 2, 3])],
          'synthetic-invalid.zip',
          { type: 'application/zip' },
        );
        const invalidExchange = await warmWorker.request(invalidFile);
        if (
          invalidExchange.response.ok ||
          invalidExchange.response.operationId !==
            `${scenarioName}-${operationNumber}` ||
          'result' in invalidExchange.response
        ) {
          warmWorker.close();
          throw new Error('Invalid ZIP did not fail without a partial result.');
        }

        const oversizedFile = new File(
          [oversizedBytes],
          'synthetic-oversized.zip',
          { type: 'application/zip' },
        );
        const oversizedExchange = await warmWorker.request(oversizedFile);
        if (
          oversizedExchange.response.ok ||
          'result' in oversizedExchange.response
        ) {
          warmWorker.close();
          throw new Error(
            'Oversized ZIP did not fail without a partial result.',
          );
        }
        const recovered = await warmWorker.request(selectedFile);
        if (
          !recovered.response.ok ||
          !sameResult(
            recovered.response.result,
            await importFiles([selectedFile]),
          )
        ) {
          warmWorker.close();
          throw new Error(
            'Worker did not recover after controlled import errors.',
          );
        }

        const warmupResult = await importFiles([selectedFile]);
        const workerWarmup = await warmWorker.request(selectedFile);
        if (
          !workerWarmup.response.ok ||
          !sameResult(warmupResult, workerWarmup.response.result)
        ) {
          warmWorker.close();
          throw new Error('Warm-up outputs differ between import paths.');
        }
        assertMatchesReference(warmupResult);
        runAnalyze(warmupResult);
        const samples: ImportMeasurement[] = [];
        for (let repetition = 0; repetition < 5; repetition++) {
          const current = async () => mainImport(repetition);
          const warm = async () =>
            workerImport(warmWorker, repetition, 'worker-warm');
          const cold = async () => {
            const coldStart = performance.now();
            const client = await createWorker();
            try {
              return await workerImport(
                client,
                repetition,
                'worker-cold',
                coldStart,
              );
            } finally {
              client.close();
            }
          };
          const ordered =
            repetition % 2 === 0
              ? [current, warm, cold]
              : [cold, warm, current];
          for (const run of ordered) samples.push(await run());
        }
        warmWorker.close();
        return {
          samples: samples.map((sample) => ({
            ...sample,
            internalImportMs: Number(sample.internalImportMs.toFixed(2)),
            observableMs: Number(sample.observableMs.toFixed(2)),
            workerCreationMs:
              sample.workerCreationMs === null
                ? null
                : Number(sample.workerCreationMs.toFixed(2)),
            postMessageCallMs:
              sample.postMessageCallMs === null
                ? null
                : Number(sample.postMessageCallMs.toFixed(2)),
            roundTripMs:
              sample.roundTripMs === null
                ? null
                : Number(sample.roundTripMs.toFixed(2)),
            analyzeMs: Number(sample.analyzeMs.toFixed(2)),
            importLongestTaskMs:
              sample.importLongestTaskMs === null
                ? null
                : Number(sample.importLongestTaskMs.toFixed(2)),
            analyzeLongestTaskMs:
              sample.analyzeLongestTaskMs === null
                ? null
                : Number(sample.analyzeLongestTaskMs.toFixed(2)),
          })),
          errorChecks: {
            missingResponseTimedOut: noResponseWasHandled,
            invalidZipError: invalidExchange.response.ok
              ? null
              : invalidExchange.response.error,
            oversizedError: oversizedExchange.response.ok
              ? null
              : oversizedExchange.response.error,
            validRetrySucceeded: recovered.response.ok,
          },
          workerCreationWarmMs: Number(warmWorker.readyMs.toFixed(2)),
          functionalResultsIdentical: true,
        };
      },
      {
        scenarioName: fixture.name,
        expectedCounts: archive.counts,
        oversizedBytes: oversizedZipBytes,
      },
    );

    const expectedResult = {
      followers: archive.counts.followers,
      following: archive.counts.following,
      mutuals: archive.counts.mutuals,
      notBack: archive.counts.notBack,
      fans: archive.counts.followers - archive.counts.mutuals,
    };
    for (const sample of results.samples) {
      expect(sample.counts).toEqual(expectedResult);
      measurements.push({
        scenario: fixture.name,
        archiveBytes: archive.archiveBytes,
        uncompressedBytes: archive.uncompressedBytes,
        compression: archive.compression,
        sample,
      });
    }
    expect(results.errorChecks.invalidZipError).not.toBeNull();
    expect(results.errorChecks.oversizedError).not.toBeNull();
    expect(results.errorChecks.missingResponseTimedOut).toBe(true);
    expect(results.errorChecks.validRetrySucceeded).toBe(true);
    expect(results.functionalResultsIdentical).toBe(true);
    console.log(
      JSON.stringify({
        scenario: fixture.name,
        syntheticOnly: true,
        nodeVersion: process.version,
        chromiumVersion: page.context().browser()?.version() ?? 'unknown',
        archiveBytes: archive.archiveBytes,
        compressedRelationshipBytes: archive.compressedBytes,
        uncompressedRelationshipBytes: archive.uncompressedBytes,
        expectedCounts: archive.counts,
        workerCreationWarmMs: results.workerCreationWarmMs,
        samples: results.samples,
        errorChecks: {
          missingResponseTimedOut: results.errorChecks.missingResponseTimedOut,
          invalidZipRejectedWithoutPartialResult: true,
          oversizedZipRejectedWithoutPartialResult: true,
          validRetrySucceededAfterFailures: true,
        },
        timingNote:
          'Main internalImportMs is browser-side importFiles wall time. Worker internalImportMs is measured inside the worker; observableMs is page-side worker round trip or cold creation-through-result. postMessageCallMs is synchronous dispatch only, not a transfer-duration estimate. File is structured-cloned, not transferred as a full ZIP buffer; result arrays are cloned back. Analyze is measured on the main thread after each import. Heap values are optional Chromium JS-heap snapshots, not peak or process memory. Dashboard React updates are not part of this non-production harness.',
      }),
    );
  }
  expect(measurements).toHaveLength(45);
  assertNoExternalTrafficOrErrors(signals);
});

test('measures a valid import at the cumulative 30 MiB boundary and compares compression methods', async ({
  page,
}) => {
  const signals = await preparePage(page);
  const dialog = page.getByRole('dialog', { name: 'Una nueva perspectiva' });
  const compressionVariants: ZipCompression[] =
    process.env.FOLLOWLENS_CPU_PROFILE === '1'
      ? ['deflate']
      : ['deflate', 'store'];
  for (const compression of compressionVariants) {
    const archive = makeBudgetZip(MAX_JSON_TOTAL, compression);
    expect(archive.uncompressedBytes).toBe(MAX_JSON_TOTAL);
    expect(archive.compressedBytes).toBeLessThanOrEqual(MAX_COMPRESSED_TOTAL);
    const scenario = `cumulative-30-mib-valid-${compression}-zip-ui`;
    await openImportDialog(
      page,
      dialog,
      archive,
      `synthetic-exact-limit-${compression}.zip`,
    );
    await measureInstrumentedImport(page, archive, scenario);

    const profiled = await submitAndWaitForOutcome(page, dialog);
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole('status').filter({ hasText: 'Importación lista.' }),
    ).toBeVisible();
    const measurements = await readBrowserMetrics(page, 'success');
    const actualCounts = await assertDashboardCounts(page, archive.counts);
    logMetrics(
      scenario,
      page,
      archive,
      measurements,
      profiled.harnessObservedMs,
      actualCounts,
    );
    logCpuProfile(scenario, profiled.profileSummary);
  }
  assertNoExternalTrafficOrErrors(signals);
});

test('reports cumulative limit plus one byte and recovers without partial results', async ({
  page,
}) => {
  const signals = await preparePage(page);
  const overLimitArchive = makeBudgetZip(MAX_JSON_TOTAL + 1);
  expect(overLimitArchive.uncompressedBytes).toBe(MAX_JSON_TOTAL + 1);
  expect(overLimitArchive.compressedBytes).toBeLessThanOrEqual(
    MAX_COMPRESSED_TOTAL,
  );
  const dialog = page.getByRole('dialog', { name: 'Una nueva perspectiva' });
  await openImportDialog(
    page,
    dialog,
    overLimitArchive,
    'synthetic-over-limit.zip',
  );

  const errorHarnessStart = await beginImport(dialog);
  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText(/límite de 30 MB/i);
  const errorHarnessObservedMs = nodePerformance.now() - errorHarnessStart;
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Tus relaciones.' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('status').filter({ hasText: 'Importación lista.' }),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.__followLensBenchmark?.outcome ?? null),
    )
    .toBe('error');
  const errorMeasurements = await readBrowserMetrics(page, 'error');
  logMetrics(
    'cumulative-30-mib-plus-one-controlled-error',
    page,
    overLimitArchive,
    errorMeasurements,
    errorHarnessObservedMs,
    null,
  );

  const recoveryArchive = jsonZip(['recovery_follower'], ['recovery_followed']);
  const fileInput = dialog.getByLabel('Archivos de Instagram');
  await fileInput.setInputFiles({
    name: 'synthetic-recovery.zip',
    mimeType: 'application/zip',
    buffer: recoveryArchive.buffer,
  });
  await expect(
    dialog.getByText('synthetic-recovery.zip', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    const state = window.__followLensBenchmark;
    if (!state) throw new Error('Browser benchmark observer is unavailable.');
    state.startedAt = null;
    state.finishedAt = null;
    state.outcome = null;
    state.memoryBeforeBytes = null;
    state.jsonParseMs = 0;
    state.jsonParseCount = 0;
  });
  const recoveryHarnessStart = await beginImport(dialog);
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: 'Importación lista.' }),
  ).toBeVisible();
  const recoveryHarnessObservedMs =
    nodePerformance.now() - recoveryHarnessStart;
  await expect
    .poll(() =>
      page.evaluate(() => window.__followLensBenchmark?.outcome ?? null),
    )
    .toBe('success');
  const recoveryMeasurements = await readBrowserMetrics(page, 'success');
  const actualCounts = await assertDashboardCounts(
    page,
    recoveryArchive.counts,
  );
  logMetrics(
    'small-json-zip-recovery-after-limit-error',
    page,
    recoveryArchive,
    recoveryMeasurements,
    recoveryHarnessObservedMs,
    actualCounts,
  );
  assertNoExternalTrafficOrErrors(signals);
});

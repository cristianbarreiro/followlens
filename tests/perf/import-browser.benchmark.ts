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

type SyntheticArchive = {
  buffer: Buffer;
  archiveBytes: number;
  compressedBytes: number;
  uncompressedBytes: number;
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
): SyntheticArchive {
  const followerBytes = strToU8(JSON.stringify(followers.map(record)));
  const followingBytes = strToU8(
    JSON.stringify({
      relationships_following: following.map(record),
    }),
  );
  const archive = zipSync({
    'connections/followers_and_following/followers_1.json': followerBytes,
    'connections/followers_and_following/following.json': followingBytes,
  });
  const followingSet = new Set(following);
  const mutuals = followers.filter((name) => followingSet.has(name)).length;
  const compressedBytes = inspectArchive(archive).compressedBytes;
  return {
    buffer: Buffer.from(archive),
    archiveBytes: archive.byteLength,
    compressedBytes,
    uncompressedBytes: followerBytes.byteLength + followingBytes.byteLength,
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
  relevantEntries: number;
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
  let relevantEntries = 0;
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
      relevantEntries += 1;
    }
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== centralEnd)
    throw new Error('Synthetic benchmark ZIP central directory is incomplete.');
  return { compressedBytes, uncompressedBytes, relevantEntries };
}

function makeBudgetZip(totalUncompressedBytes: number): SyntheticArchive {
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

  const archive = zipSync({
    'connections/followers_and_following/followers_1.json': followerBytes,
    'connections/followers_and_following/following.json': followingBytes,
  });
  const metadata = inspectArchive(archive);
  if (
    metadata.relevantEntries !== 2 ||
    metadata.uncompressedBytes !== totalUncompressedBytes ||
    metadata.compressedBytes > MAX_COMPRESSED_TOTAL
  ) {
    throw new Error('Synthetic budget ZIP does not match importer limits.');
  }
  const mutuals = 0;
  return {
    buffer: Buffer.from(archive),
    archiveBytes: archive.byteLength,
    compressedBytes: metadata.compressedBytes,
    uncompressedBytes: metadata.uncompressedBytes,
    counts: { followers: 1, following: 0, mutuals, notBack: 0 },
  };
}

function mediumArchive(): SyntheticArchive {
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
  const archive = makeRelationshipZip(followers, following);
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

test('measures medium synthetic relationship import in Chromium', async ({
  page,
}) => {
  const signals = await preparePage(page);
  const archive = mediumArchive();
  const dialog = page.getByRole('dialog', { name: 'Una nueva perspectiva' });
  await openImportDialog(page, dialog, archive, 'synthetic-medium.zip');

  const profiled = await submitAndWaitForOutcome(page, dialog);
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: 'Importación lista.' }),
  ).toBeVisible();
  const measurements = await readBrowserMetrics(page, 'success');
  const actualCounts = await assertDashboardCounts(page, archive.counts);
  logMetrics(
    'medium-json-zip-ui',
    page,
    archive,
    measurements,
    profiled.harnessObservedMs,
    actualCounts,
  );
  logCpuProfile('medium-json-zip-ui', profiled.profileSummary);
  assertNoExternalTrafficOrErrors(signals);
});

test('measures a valid import at the cumulative 30 MiB boundary', async ({
  page,
}) => {
  const signals = await preparePage(page);
  const archive = makeBudgetZip(MAX_JSON_TOTAL);
  expect(archive.uncompressedBytes).toBe(MAX_JSON_TOTAL);
  expect(archive.compressedBytes).toBeLessThanOrEqual(MAX_COMPRESSED_TOTAL);
  const dialog = page.getByRole('dialog', { name: 'Una nueva perspectiva' });
  await openImportDialog(page, dialog, archive, 'synthetic-exact-limit.zip');

  const profiled = await submitAndWaitForOutcome(page, dialog);
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: 'Importación lista.' }),
  ).toBeVisible();
  const measurements = await readBrowserMetrics(page, 'success');
  const actualCounts = await assertDashboardCounts(page, archive.counts);
  logMetrics(
    'cumulative-30-mib-valid-json-zip-ui',
    page,
    archive,
    measurements,
    profiled.harnessObservedMs,
    actualCounts,
  );
  logCpuProfile(
    'cumulative-30-mib-valid-json-zip-ui',
    profiled.profileSummary,
  );
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

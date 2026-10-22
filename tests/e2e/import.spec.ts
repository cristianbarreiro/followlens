import { expect, test, type Locator, type Page } from '@playwright/test';
import { strToU8, zipSync } from 'fflate';
import { readFile } from 'node:fs/promises';

const appUrl = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4173';
const appAddress = new URL(appUrl);
const importDate = '2020-01-02';
const jsonFollowers = ['ana', 'mutua', 'fan'];
const jsonFollowing = ['mutua', 'no_devuelve'];
const htmlFollowers = ['html_ana', 'html_mutua', 'cuenta.ejemplo'];
const htmlFollowing = ['html_mutua', 'html_no_devuelve'];

type BrowserSignals = {
  consoleErrors: number;
  pageErrors: number;
  externalOrigins: string[];
};

function isAppTraffic(url: URL): boolean {
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
    if (message.type() === 'error') {
      signals.consoleErrors += 1;
      console.error(`Browser console error: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => {
    signals.pageErrors += 1;
    console.error(`Browser page error: ${error.stack ?? error.message}`);
  });
  page.context().on('request', (request) => {
    const url = new URL(request.url());
    if (!isAppTraffic(url)) signals.externalOrigins.push(url.origin);
  });
  page.on('websocket', (socket) => {
    const url = new URL(socket.url());
    if (!isAppTraffic(url)) signals.externalOrigins.push(url.origin);
  });
  return signals;
}

function jsonRecord(value: string) {
  return { string_list_data: [{ value }] };
}

function jsonZip(followers: string[], following: string[]): Buffer {
  const archive = zipSync({
    'connections/followers_and_following/followers_1.json': strToU8(
      JSON.stringify(followers.map(jsonRecord)),
    ),
    'connections/followers_and_following/following.json': strToU8(
      JSON.stringify({ relationships_following: following.map(jsonRecord) }),
    ),
    'media/synthetic.jpg': new Uint8Array([0, 1, 2, 3]),
    'your_instagram_activity/messages/synthetic.txt': strToU8(
      'Synthetic unrelated content.',
    ),
  });
  return Buffer.from(archive);
}

function htmlDocument(records: string[], title: string): string {
  return `<!doctype html><html><head><title>${title}</title></head><body><div class="_li"><main role="main">${records.join('')}</main></div></body></html>`;
}

function htmlFollowerFile(usernames: string[]): string {
  const records = usernames.map(
    (username) =>
      `<div class="pam uiBoxWhite noborder"><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/${username}">${username}</a></div><div>Oct 8, 2026</div></div></div></div>`,
  );
  return htmlDocument(records, 'Seguidores');
}

function htmlFollowingFile(usernames: string[]): string {
  const records = usernames.map(
    (username) =>
      `<div class="pam uiBoxWhite noborder"><div class="_a6-p"><div><div><a target="_blank" href="https://www.instagram.com/_u/${username}">${username}</a></div><div>Oct 8, 2026</div></div></div></div>`,
  );
  return htmlDocument(records, 'Seguidos');
}

function htmlZip(followers: string[], following: string[]): Buffer {
  const archive = zipSync({
    'connections/followers_and_following/followers_1.html': strToU8(
      htmlFollowerFile(followers),
    ),
    'connections/followers_and_following/following.html': strToU8(
      htmlFollowingFile(following),
    ),
    'your_instagram_activity/threads/following.html': strToU8(
      htmlFollowingFile(['threads_only']),
    ),
    'start_here.html': strToU8('<!doctype html><html><body></body></html>'),
    'media/synthetic.jpg': new Uint8Array([4, 5, 6, 7]),
  });
  return Buffer.from(archive);
}

function filePayload(
  name: string,
  contents: string | Buffer,
  mimeType: string,
) {
  return {
    name,
    mimeType,
    buffer: typeof contents === 'string' ? Buffer.from(contents) : contents,
  };
}

async function openImportDialog(page: Page) {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Lo que cambia. Lo que importa.' }),
  ).toBeVisible();
  await expect(page.getByText(/ZIP o archivos JSON o HTML/)).toBeVisible();
  await page.getByRole('button', { name: 'Importar datos' }).click();
  const dialog = page.getByRole('dialog', { name: 'Una nueva perspectiva' });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(
      /ZIP o archivos individuales JSON\/HTML del mismo formato/,
    ),
  ).toBeVisible();
  return dialog;
}

async function chooseFiles(
  dialog: Locator,
  files: Parameters<Locator['setInputFiles']>[0],
  displayedNames: string,
  date = importDate,
) {
  await dialog.getByLabel('Archivos de Instagram').setInputFiles(files);
  await expect(dialog.getByText(displayedNames, { exact: true })).toBeVisible();
  await dialog.getByLabel('Tu usuario').fill('test_owner');
  await dialog.getByLabel('Fecha de la exportación').fill(date);
  await dialog.getByRole('checkbox').first().check();
}

async function submitImport(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Analizar importación' }).click();
}

async function assertDashboardResults(
  page: Page,
  expected: {
    followers: string[];
    following: string[];
    mutuals: string[];
    notBack: string[];
  },
) {
  const summary = page.getByRole('region', { name: 'Resumen de relaciones' });
  const list = page.getByRole('region', { name: 'Listado de cuentas' });
  await expect(summary.getByRole('button').nth(0).locator('strong')).toHaveText(
    String(expected.followers.length),
  );
  await expect(summary.getByRole('button').nth(1).locator('strong')).toHaveText(
    String(expected.following.length),
  );
  await expect(summary.getByRole('button').nth(2).locator('strong')).toHaveText(
    String(expected.mutuals.length),
  );
  await expect(list.getByRole('row')).toHaveCount(expected.notBack.length + 1);
  for (const name of expected.notBack)
    await expect(list.getByText(`@${name}`, { exact: true })).toBeVisible();
  const groups = [
    { index: 0, names: expected.followers },
    { index: 1, names: expected.following },
    { index: 2, names: expected.mutuals },
  ];
  for (const group of groups) {
    await summary.getByRole('button').nth(group.index).click();
    await expect(list.getByRole('row')).toHaveCount(group.names.length + 1);
    for (const name of group.names)
      await expect(list.getByText(`@${name}`, { exact: true })).toBeVisible();
  }
  await summary
    .getByRole('button')
    .filter({ hasText: 'Te siguen de vuelta' })
    .click();
  await expect(list.getByRole('row')).toHaveCount(expected.mutuals.length + 1);
  for (const name of expected.mutuals)
    await expect(list.getByText(`@${name}`, { exact: true })).toBeVisible();
}

function successNotice(page: Page) {
  return page.getByRole('status').filter({ hasText: 'Importación lista.' });
}

async function assertBrowserPrivacy(signals: BrowserSignals) {
  expect(signals.consoleErrors).toBe(0);
  expect(signals.pageErrors).toBe(0);
  expect(signals.externalOrigins).toEqual([]);
}

test('imports a synthetic JSON ZIP through the UI and shows dashboard relationships', async ({
  page,
}) => {
  await page.addInitScript(`
    (() => {
      const read = Blob.prototype.arrayBuffer;
      let held = false;
      Blob.prototype.arrayBuffer = function () {
        if (held) return read.call(this);
        held = true;
        return new Promise((resolve, reject) => {
          window.addEventListener(
            'followlens-release-file-read',
            () => read.call(this).then(resolve, reject),
            { once: true },
          );
        });
      };
    })();
  `);
  const signals = monitorBrowser(page);
  const dialog = await openImportDialog(page);
  await chooseFiles(
    dialog,
    filePayload(
      'synthetic-json.zip',
      jsonZip(jsonFollowers, jsonFollowing),
      'application/zip',
    ),
    'synthetic-json.zip',
  );
  const browserBefore = await page.evaluate(() => {
    const memory = (
      performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
          jsHeapSizeLimit: number;
        };
      }
    ).memory;
    return {
      heapUsedBytes: memory?.usedJSHeapSize ?? null,
      heapLimitBytes: memory?.jsHeapSizeLimit ?? null,
    };
  });
  await submitImport(dialog);
  const processing = dialog.getByRole('status');
  await expect(processing).toHaveText(
    'Leyendo y validando los archivos en este dispositivo…',
  );
  await expect(
    dialog.getByRole('button', { name: 'Analizando en tu dispositivo…' }),
  ).toBeDisabled();
  const browserProcessingStartedAt = await page.evaluate(() => {
    const startedAt = performance.now();
    window.dispatchEvent(new Event('followlens-release-file-read'));
    return startedAt;
  });

  await expect(dialog).toBeHidden();
  const browserAfter = await page.evaluate(() => {
    const memory = (
      performance as Performance & {
        memory?: {
          usedJSHeapSize: number;
        };
      }
    ).memory;
    return {
      elapsedMs: performance.now(),
      heapUsedBytes: memory?.usedJSHeapSize ?? null,
    };
  });
  console.log(
    JSON.stringify({
      browserScenario: 'synthetic-small-json-zip-ui-import',
      browserVersion: page.context().browser()?.version() ?? 'unknown',
      elapsedMs: Number(
        (browserAfter.elapsedMs - browserProcessingStartedAt).toFixed(2),
      ),
      chromiumJsHeapBeforeBytes: browserBefore.heapUsedBytes,
      chromiumJsHeapAfterBytes: browserAfter.heapUsedBytes,
      chromiumJsHeapLimitBytes: browserBefore.heapLimitBytes,
      note: 'Synthetic data; elapsed time includes Playwright close observation; heap API is approximate.',
    }),
  );
  await expect(successNotice(page)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Tus relaciones.' }),
  ).toBeVisible();
  await assertDashboardResults(page, {
    followers: jsonFollowers,
    following: jsonFollowing,
    mutuals: ['mutua'],
    notBack: ['no_devuelve'],
  });
  await assertBrowserPrivacy(signals);
});

test('imports a synthetic HTML ZIP through the UI and shows parsed relationships', async ({
  page,
}) => {
  const signals = monitorBrowser(page);
  const dialog = await openImportDialog(page);
  await chooseFiles(
    dialog,
    filePayload(
      'synthetic-html.zip',
      htmlZip(htmlFollowers, htmlFollowing),
      'application/zip',
    ),
    'synthetic-html.zip',
  );
  await submitImport(dialog);

  await expect(dialog).toBeHidden();
  await expect(successNotice(page)).toBeVisible();
  await assertDashboardResults(page, {
    followers: htmlFollowers,
    following: htmlFollowing,
    mutuals: ['html_mutua'],
    notBack: ['html_no_devuelve'],
  });
  await assertBrowserPrivacy(signals);
});

test('imports standalone multipart HTML and preserves filename and format validation', async ({
  page,
}) => {
  const signals = monitorBrowser(page);
  const dialog = await openImportDialog(page);
  const fileInput = dialog.getByLabel('Archivos de Instagram');

  const incompleteParts = [
    filePayload(
      'followers_1.html',
      htmlFollowerFile(['part_one']),
      'text/html',
    ),
    filePayload(
      'followers_3.html',
      htmlFollowerFile(['part_three']),
      'text/html',
    ),
    filePayload(
      'following.html',
      htmlFollowingFile(['part_mutual', 'part_no_devuelve']),
      'text/html',
    ),
  ];
  const incompleteNames = 'followers_1.html, followers_3.html, following.html';
  await chooseFiles(dialog, incompleteParts, incompleteNames);
  await submitImport(dialog);
  await expect(dialog.getByRole('alert')).toContainText(
    'Falta una parte de followers',
  );
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(
    dialog.getByText(incompleteNames, { exact: true }),
  ).toBeVisible();
  await expect(successNotice(page)).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Tus relaciones.' }),
  ).toHaveCount(0);

  const mixedFiles = [
    filePayload(
      'followers_1.json',
      JSON.stringify([jsonRecord('json_user')]),
      'application/json',
    ),
    filePayload(
      'following.html',
      htmlFollowingFile(['html_user']),
      'text/html',
    ),
  ];
  const mixedNames = 'followers_1.json, following.html';
  await fileInput.setInputFiles(mixedFiles);
  await expect(dialog.getByText(mixedNames, { exact: true })).toBeVisible();
  await submitImport(dialog);
  await expect(dialog.getByRole('alert')).toContainText(
    'No mezcles archivos JSON y HTML',
  );
  await expect(dialog.getByText(mixedNames, { exact: true })).toBeVisible();
  await expect(successNotice(page)).toHaveCount(0);

  const validParts = [
    filePayload(
      'followers_1.html',
      htmlFollowerFile(['part_one']),
      'text/html',
    ),
    filePayload(
      'followers_2.html',
      htmlFollowerFile(['part_two', 'part_mutua']),
      'text/html',
    ),
    filePayload(
      'following.html',
      htmlFollowingFile(['part_mutua', 'part_no_devuelve']),
      'text/html',
    ),
  ];
  const validNames = 'followers_1.html, followers_2.html, following.html';
  await fileInput.setInputFiles(validParts);
  await expect(dialog.getByText(validNames, { exact: true })).toBeVisible();
  await submitImport(dialog);

  await expect(dialog).toBeHidden();
  await expect(successNotice(page)).toBeVisible();
  await assertDashboardResults(page, {
    followers: ['part_one', 'part_two', 'part_mutua'],
    following: ['part_mutua', 'part_no_devuelve'],
    mutuals: ['part_mutua'],
    notBack: ['part_no_devuelve'],
  });
  await assertBrowserPrivacy(signals);
});

test('reports corrupted ZIPs without partial results and allows retry', async ({
  page,
}) => {
  const signals = monitorBrowser(page);
  const dialog = await openImportDialog(page);
  const fileInput = dialog.getByLabel('Archivos de Instagram');
  await chooseFiles(
    dialog,
    filePayload(
      'corrupted.zip',
      Buffer.from('not a ZIP archive'),
      'application/zip',
    ),
    'corrupted.zip',
  );
  await submitImport(dialog);

  const error = dialog.getByRole('alert');
  await expect(error).toBeVisible();
  await expect(error).toContainText(/ZIP|archivo|dañado/i);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('status')).toHaveCount(0);
  await expect(successNotice(page)).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Tus relaciones.' }),
  ).toHaveCount(0);

  await fileInput.setInputFiles(
    filePayload(
      'retry-json.zip',
      jsonZip(jsonFollowers, jsonFollowing),
      'application/zip',
    ),
  );
  await expect(
    dialog.getByText('retry-json.zip', { exact: true }),
  ).toBeVisible();
  await submitImport(dialog);
  await expect(dialog).toBeHidden();
  await expect(successNotice(page)).toBeVisible();
  await assertDashboardResults(page, {
    followers: jsonFollowers,
    following: jsonFollowing,
    mutuals: ['mutua'],
    notBack: ['no_devuelve'],
  });
  await assertBrowserPrivacy(signals);
});

test('manually marked profiles filter dashboard metrics, history, and CSV consistently', async ({
  page,
}) => {
  const signals = monitorBrowser(page);
  const firstDialog = await openImportDialog(page);
  await chooseFiles(
    firstDialog,
    filePayload(
      'availability-before.zip',
      jsonZip(['ana', 'suspended', 'oldmutual'], ['suspended', 'oldmutual']),
      'application/zip',
    ),
    'availability-before.zip',
    '2026-10-01',
  );
  await firstDialog.getByRole('checkbox').nth(1).check();
  await submitImport(firstDialog);
  await expect(firstDialog).toBeHidden();

  await page.getByRole('button', { name: 'Importar datos' }).click();
  const secondDialog = page.getByRole('dialog', { name: 'Una nueva perspectiva' });
  await chooseFiles(
    secondDialog,
    filePayload(
      'availability-after.zip',
      jsonZip(['ana', 'oldmutual', 'newfriend'], ['suspended', 'oldmutual', 'newfriend']),
      'application/zip',
    ),
    'availability-after.zip',
    '2026-10-02',
  );
  await secondDialog.getByRole('checkbox').nth(1).check();
  await submitImport(secondDialog);
  await expect(secondDialog).toBeHidden();

  const statCards = page.locator('.stat-grid .stat-card');
  await expect(statCards.nth(0).locator('strong')).toHaveText('3');
  await expect(page.getByText('1 seguidores ya no aparecen')).toBeVisible();
  const results = page.locator('.people-table');
  await expect(results.getByText('@suspended')).toBeVisible();

  await page.getByRole('button', { name: 'Gestionar perfiles' }).click();
  const availabilityDialog = page.getByRole('dialog', {
    name: 'Perfiles identificados como no disponibles',
  });
  await availabilityDialog
    .getByLabel('Agregar nombres de usuario')
    .fill('@suspended');
  await availabilityDialog
    .getByLabel('Motivo (opcional, para todos los nombres que agregues)')
    .fill('Cuenta suspendida');
  await availabilityDialog.getByRole('button', { name: 'Agregar a la lista' }).click();
  await expect(
    availabilityDialog.getByLabel('Motivo de la marca para suspended'),
  ).toHaveValue('Cuenta suspendida');
  await availabilityDialog.getByRole('button', { name: 'Cerrar' }).click();

  const exclusion = page.getByRole('checkbox', {
    name: 'Excluir perfiles identificados manualmente como no disponibles',
  });
  await expect(exclusion).not.toBeChecked();
  await exclusion.check();
  await expect(statCards.nth(1).locator('strong')).toHaveText('2');
  await expect(page.getByText('0 seguidores ya no aparecen')).toBeVisible();
  await expect(results.getByText('@suspended')).toHaveCount(0);

  await page.getByLabel('Filtrar relaciones').click();
  await page.getByRole('option', { name: /Seguidos · 2/ }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar CSV' }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).not.toContain('suspended');

  await exclusion.uncheck();
  await expect(statCards.nth(1).locator('strong')).toHaveText('3');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Tus relaciones.' })).toBeVisible();
  await expect(
    page.getByRole('checkbox', {
      name: 'Excluir perfiles identificados manualmente como no disponibles',
    }),
  ).not.toBeChecked();
  await page.getByRole('button', { name: 'Gestionar perfiles' }).click();
  await expect(
    page
      .getByRole('dialog', { name: 'Perfiles identificados como no disponibles' })
      .getByText('@suspended'),
  ).toBeVisible();
  await assertBrowserPrivacy(signals);
});

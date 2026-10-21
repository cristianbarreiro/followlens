import { expect, test, type Page } from '@playwright/test';

type BrowserSignals = {
  consoleErrors: number;
  pageErrors: number;
  externalOrigins: string[];
};

function isAppTraffic(url: URL, appAddress: URL): boolean {
  return (
    url.hostname === appAddress.hostname &&
    url.port === appAddress.port &&
    (url.protocol === 'http:' || url.protocol === 'ws:')
  );
}

function monitorBrowser(page: Page, appAddress: URL): BrowserSignals {
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
    if (!isAppTraffic(url, appAddress)) signals.externalOrigins.push(url.origin);
  });
  page.on('websocket', (socket) => {
    const url = new URL(socket.url());
    if (!isAppTraffic(url, appAddress)) signals.externalOrigins.push(url.origin);
  });
  return signals;
}

test.describe('Light/Dark theme system with light-dark()', () => {
  test('1 & 2. Default light theme and theme toggle accessibility in header', async ({
    page,
    baseURL,
  }) => {
    const appAddress = new URL(baseURL ?? 'http://localhost:3000');
    const signals = monitorBrowser(page, appAddress);
    await page.goto('/');

    const toggle = page.locator('.header-actions .theme-toggle[data-hydrated="true"]');
    await expect(toggle).toBeVisible();

    // Verify initial theme state is light without saved preference
    const htmlTheme = await page.evaluate(() =>
      document.documentElement.getAttribute('data-theme'),
    );
    expect(htmlTheme === null || htmlTheme === 'light').toBe(true);

    const bodyBg = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(bodyBg).toBe('rgb(245, 246, 250)'); // #f5f6fa

    // Verify accessible labels and state
    await expect(toggle).toHaveAttribute('aria-label', 'Cambiar a tema oscuro');
    await expect(toggle).toHaveAttribute('title', 'Cambiar a tema oscuro');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    // Verify icon is marked as decorative
    const icon = toggle.locator('.theme-toggle-icon');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');

    // Verify order in .header-actions: privacy -> theme-toggle -> help
    const elements = await page
      .locator('.header-actions > *')
      .evaluateAll((nodes) =>
        nodes.map((node) => node.className || node.tagName.toLowerCase()),
      );
    const privacyIndex = elements.findIndex((c) => c.includes('privacy'));
    const toggleIndex = elements.findIndex((c) => c.includes('theme-toggle'));
    const helpIndex = elements.findIndex((c) => c.includes('icon-button'));
    expect(privacyIndex).toBeLessThan(toggleIndex);
    expect(toggleIndex).toBeLessThan(helpIndex);

    // Verify zero console errors and zero external requests
    expect(signals.consoleErrors).toBe(0);
    expect(signals.pageErrors).toBe(0);
    expect(signals.externalOrigins).toEqual([]);
  });

  test('3 & 4. Toggle to dark mode and back to light mode with full UI updates', async ({
    page,
    baseURL,
  }) => {
    const appAddress = new URL(baseURL ?? 'http://localhost:3000');
    const signals = monitorBrowser(page, appAddress);
    await page.goto('/');

    const toggle = page.locator('.header-actions .theme-toggle[data-hydrated="true"]');
    await expect(toggle).toBeVisible();

    // Click to toggle to dark mode
    await toggle.click();

    // Verify document attributes and color-scheme
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    const darkHasClass = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(darkHasClass).toBe(true);

    const darkColorScheme = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    );
    expect(darkColorScheme).toContain('dark');

    // Verify body and card backgrounds in dark mode after transition
    await expect.poll(async () => {
      return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    }).toBe('rgb(17, 18, 27)'); // #11121b

    await expect.poll(async () => {
      return page.evaluate(() => {
        const card = document.querySelector('.import-card');
        return card ? getComputedStyle(card).backgroundColor : null;
      });
    }).toBe('rgb(27, 28, 41)'); // #1b1c29

    // Verify toggle updated label and icon for dark mode
    await expect(toggle).toHaveAttribute('aria-label', 'Cambiar a tema claro');
    await expect(toggle).toHaveAttribute('title', 'Cambiar a tema claro');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Click again to toggle back to light mode
    await toggle.click();

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await expect.poll(async () => {
      return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    }).toBe('rgb(245, 246, 250)'); // #f5f6fa

    await expect(toggle).toHaveAttribute('aria-label', 'Cambiar a tema oscuro');
    await expect(toggle).toHaveAttribute('title', 'Cambiar a tema oscuro');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    expect(signals.consoleErrors).toBe(0);
    expect(signals.pageErrors).toBe(0);
    expect(signals.externalOrigins).toEqual([]);
  });

  test('5. Persists dark preference in localStorage across page reload without FOUC', async ({
    page,
    baseURL,
  }) => {
    const appAddress = new URL(baseURL ?? 'http://localhost:3000');
    const signals = monitorBrowser(page, appAddress);
    await page.goto('/');

    const toggle = page.locator('.header-actions .theme-toggle[data-hydrated="true"]');
    await expect(toggle).toBeVisible();
    await toggle.click();

    // Check localStorage has saved 'dark'
    await expect.poll(async () => {
      return page.evaluate(() => localStorage.getItem('followlens-theme'));
    }).toBe('dark');

    // Reload page
    await page.reload();

    // Verify dark theme applied immediately
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await expect.poll(async () => {
      return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    }).toBe('rgb(17, 18, 27)');

    const reloadedToggle = page.locator('.header-actions .theme-toggle[data-hydrated="true"]');
    await expect(reloadedToggle).toBeVisible();
    await expect(reloadedToggle).toHaveAttribute('aria-label', 'Cambiar a tema claro');
    await expect(reloadedToggle).toHaveAttribute('title', 'Cambiar a tema claro');

    expect(signals.consoleErrors).toBe(0);
    expect(signals.pageErrors).toBe(0);
    expect(signals.externalOrigins).toEqual([]);
  });

  test('6. Keyboard navigation and focus accessibility', async ({ page, baseURL }) => {
    const appAddress = new URL(baseURL ?? 'http://localhost:3000');
    const signals = monitorBrowser(page, appAddress);
    await page.goto('/');

    const toggle = page.locator('.header-actions .theme-toggle[data-hydrated="true"]');
    await expect(toggle).toBeVisible();

    // Focus via keyboard tab or direct focus
    await toggle.focus();
    await expect(toggle).toBeFocused();

    // Press Enter to toggle
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Press Space to toggle back
    await page.keyboard.press('Space');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    expect(signals.consoleErrors).toBe(0);
    expect(signals.pageErrors).toBe(0);
  });

  test('7 & 8. Zero console errors, zero page errors, and zero external requests', async ({
    page,
    baseURL,
  }) => {
    const appAddress = new URL(baseURL ?? 'http://localhost:3000');
    const signals = monitorBrowser(page, appAddress);
    await page.goto('/');

    const toggle = page.locator('.header-actions .theme-toggle[data-hydrated="true"]');
    await expect(toggle).toBeVisible();
    await toggle.click(); // to dark
    await toggle.click(); // to light
    await toggle.click(); // to dark

    expect(signals.consoleErrors).toBe(0);
    expect(signals.pageErrors).toBe(0);
    expect(signals.externalOrigins).toEqual([]);
  });

  test('9. Legibility of tables, dialogs, forms, and cards in both themes', async ({
    page,
    baseURL,
  }) => {
    const appAddress = new URL(baseURL ?? 'http://localhost:3000');
    const signals = monitorBrowser(page, appAddress);
    await page.goto('/');

    const toggle = page.locator('.header-actions .theme-toggle[data-hydrated="true"]');
    await expect(toggle).toBeVisible();

    // 1. Check Dialog in light mode
    await page.getByRole('button', { name: 'Importar datos' }).click();
    const modal = page.locator('.modal');
    await expect(modal).toBeVisible();

    const lightModalBg = await modal.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    expect(lightModalBg).toBe('rgb(255, 255, 255)');

    const lightInputBg = await page
      .locator('.form-grid input')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(lightInputBg).toBe('rgb(255, 255, 255)');

    // Close modal
    await page.locator('.modal-close').click();
    await expect(modal).not.toBeVisible();

    // 2. Switch to dark mode
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Open Dialog in dark mode
    await page.getByRole('button', { name: 'Importar datos' }).click();
    await expect(modal).toBeVisible();

    await expect.poll(async () => {
      return modal.evaluate((el) => getComputedStyle(el).backgroundColor);
    }).toBe('rgb(27, 28, 41)'); // #1b1c29

    const darkInputBg = await page
      .locator('.form-grid input')
      .first()
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(darkInputBg).toBe('rgb(22, 23, 34)'); // #161722

    const darkInputColor = await page
      .locator('.form-grid input')
      .first()
      .evaluate((el) => getComputedStyle(el).color);
    expect(darkInputColor).toBe('rgb(240, 239, 250)'); // #f0effa

    // Close modal
    await page.locator('.modal-close').click();
    await expect(modal).not.toBeVisible();

    // 3. Open Demo dashboard to inspect tables, metrics, cards in dark mode
    await page.getByRole('button', { name: 'Explorar un ejemplo' }).click();

    // Stat cards should have dark card background
    const statCard = page.locator('.stat-card').first();
    await expect(statCard).toBeVisible();
    await expect.poll(async () => {
      return statCard.evaluate((el) => getComputedStyle(el).backgroundColor);
    }).toBe('rgb(27, 28, 41)');

    // People table headers and cells
    const tableTh = page.locator('.people-table th').first();
    await expect(tableTh).toBeVisible();
    await expect.poll(async () => {
      return tableTh.evaluate((el) => getComputedStyle(el).backgroundColor);
    }).toBe('rgb(30, 31, 47)'); // #1e1f2f

    // Insights card
    const insights = page.locator('.insights');
    await expect(insights).toBeVisible();
    await expect.poll(async () => {
      return insights.evaluate((el) => getComputedStyle(el).backgroundColor);
    }).toBe('rgb(27, 28, 41)');

    // Trend chart svg should be rendered
    const trendSvg = page.locator('.trend svg');
    await expect(trendSvg).toBeVisible();
    const gridLine = page.locator('.trend svg line').first();
    await expect(gridLine).toHaveCount(1);
    const gridStroke = await gridLine.evaluate((el) => el.getAttribute('stroke'));
    expect(gridStroke).toBe('var(--trend-grid)');

    expect(signals.consoleErrors).toBe(0);
    expect(signals.pageErrors).toBe(0);
  });

  test('10. Header responsive behavior on 1440px, 768px, 375px, and 320px', async ({
    page,
  }) => {
    const viewports = [
      { width: 1440, height: 900, name: 'desktop' },
      { width: 768, height: 1024, name: 'tablet' },
      { width: 375, height: 667, name: 'mobile' },
      { width: 320, height: 568, name: 'narrow-mobile' },
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Check header elements exist and are visible
      await expect(page.locator('.topbar .brand')).toBeVisible();
      await expect(page.locator('.topbar .privacy')).toBeVisible();
      const toggle = page.locator('.topbar .theme-toggle[data-hydrated="true"]');
      await expect(toggle).toBeVisible();
      await expect(page.locator('.topbar .icon-button')).toBeVisible();

      // Check no horizontal overflow
      const hasHorizontalScroll = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(
        hasHorizontalScroll,
        `Viewport ${vp.name} (${vp.width}px) should not have horizontal scroll`,
      ).toBe(false);

      // Verify toggle click functions properly on all sizes
      await toggle.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

      await toggle.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    }
  });

  test('11. Observes prefers-reduced-motion: reduce', async ({ page }) => {
    // Emulate reduced motion
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const toggle = page.locator('.header-actions .theme-toggle[data-hydrated="true"]');
    await expect(toggle).toBeVisible();
    const transition = await toggle.evaluate(
      (el) => getComputedStyle(el).transitionDuration,
    );
    // When prefers-reduced-motion is reduce, transition-duration should be 0s
    expect(transition === '0s' || transition === '').toBe(true);
  });
});

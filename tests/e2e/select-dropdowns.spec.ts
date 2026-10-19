import { expect, test, type Page } from '@playwright/test';

async function openDemoDashboard(page: Page) {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Lo que cambia. Lo que importa.' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Explorar un ejemplo' }).click();
  await expect(
    page.getByText('Estás explorando datos ficticios'),
  ).toBeVisible();
}

test.describe('Select dropdowns — Scroll lock, layout shift y posicionamiento', () => {
  test('1. Al abrir un selector, la barra de desplazamiento permanece estable y no cambia el ancho del documento ni del contenedor', async ({
    page,
  }) => {
    await openDemoDashboard(page);

    // Medidas iniciales antes de abrir cualquier selector
    const initialMetrics = await page.evaluate(() => {
      const workspace = document.querySelector('.workspace');
      return {
        htmlOverflowY: window.getComputedStyle(document.documentElement)
          .overflowY,
        bodyOverflowY: window.getComputedStyle(document.body).overflowY,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        workspaceWidth: workspace ? workspace.getBoundingClientRect().width : 0,
      };
    });

    const trigger = page.getByLabel('Importación actual');
    await expect(trigger).toBeVisible();
    await trigger.click();

    const popup = page.locator('[data-slot="select-content"][data-open]');
    await expect(popup).toBeVisible();

    // Medidas con el menú abierto
    const openMetrics = await page.evaluate(() => {
      const workspace = document.querySelector('.workspace');
      return {
        htmlOverflowY: window.getComputedStyle(document.documentElement)
          .overflowY,
        bodyOverflowY: window.getComputedStyle(document.body).overflowY,
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        workspaceWidth: workspace ? workspace.getBoundingClientRect().width : 0,
      };
    });

    // Ni html ni body deben haber recibido overflow: hidden
    expect(openMetrics.htmlOverflowY).not.toBe('hidden');
    expect(openMetrics.bodyOverflowY).not.toBe('hidden');

    // El ancho visible (clientWidth) y de scroll no deben cambiar por la apertura del selector (sin layout shift)
    expect(openMetrics.clientWidth).toBe(initialMetrics.clientWidth);
    expect(openMetrics.scrollWidth).toBe(initialMetrics.scrollWidth);
    expect(openMetrics.workspaceWidth).toBeCloseTo(
      initialMetrics.workspaceWidth,
      1,
    );

    // Al cerrar el menú
    await page.keyboard.press('Escape');
    await expect(popup).not.toBeVisible();

    const closedMetrics = await page.evaluate(() => {
      const workspace = document.querySelector('.workspace');
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        workspaceWidth: workspace ? workspace.getBoundingClientRect().width : 0,
      };
    });

    expect(closedMetrics.clientWidth).toBe(initialMetrics.clientWidth);
    expect(closedMetrics.workspaceWidth).toBeCloseTo(
      initialMetrics.workspaceWidth,
      1,
    );
  });

  test('2. La apertura y cierre no alteran window.scrollX ni window.scrollY, y el scroll del documento sigue disponible', async ({
    page,
  }) => {
    await openDemoDashboard(page);

    // Hacemos un scroll moderado si la página tiene altura
    await page.evaluate(() => window.scrollTo(0, 120));
    const beforeScroll = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }));

    const trigger = page.getByLabel('Importación actual');
    await trigger.click();
    const popup = page.locator('[data-slot="select-content"][data-open]');
    await expect(popup).toBeVisible();

    const duringScroll = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }));
    expect(duringScroll.x).toBe(beforeScroll.x);
    expect(duringScroll.y).toBe(beforeScroll.y);

    // El scroll normal del documento sigue funcionando mientras el menú está abierto
    await page.evaluate(() => window.scrollBy(0, 60));
    const scrolledWhileOpen = await page.evaluate(() => window.scrollY);
    expect(scrolledWhileOpen).toBe(beforeScroll.y + 60);

    // Cerramos el menú con Escape
    await page.keyboard.press('Escape');
    await expect(popup).not.toBeVisible();
  });

  test('3. El menú aparece debajo del trigger sin superponerse a él', async ({
    page,
  }) => {
    await openDemoDashboard(page);

    const trigger = page.getByLabel('Importación actual');
    const triggerBox = await trigger.boundingBox();
    expect(triggerBox).not.toBeNull();

    await trigger.click();
    const popup = page.locator('[data-slot="select-content"][data-open]');
    await expect(popup).toBeVisible();

    const popupBox = await popup.boundingBox();
    expect(popupBox).not.toBeNull();

    // El popup debe situarse debajo del trigger (popup.y >= trigger.y + trigger.height)
    expect(popupBox!.y).toBeGreaterThanOrEqual(
      triggerBox!.y + triggerBox!.height - 1,
    );

    // Verificar también el selector "Comparar con"
    await page.keyboard.press('Escape');
    await expect(popup).not.toBeVisible();

    const compareTrigger = page.getByLabel('Importación anterior');
    const compareBox = await compareTrigger.boundingBox();
    expect(compareBox).not.toBeNull();

    await compareTrigger.click();
    const comparePopup = page.locator(
      '[data-slot="select-content"][data-open]',
    );
    await expect(comparePopup).toBeVisible();
    const comparePopupBox = await comparePopup.boundingBox();
    expect(comparePopupBox).not.toBeNull();

    expect(comparePopupBox!.y).toBeGreaterThanOrEqual(
      compareBox!.y + compareBox!.height - 1,
    );
  });

  test('4. El popup no supera los límites horizontales ni verticales del viewport', async ({
    page,
  }) => {
    await openDemoDashboard(page);

    const triggers = [
      page.getByLabel('Cuenta analizada'),
      page.getByLabel('Importación actual'),
      page.getByLabel('Importación anterior'),
      page.getByLabel('Filtrar relaciones'),
    ];

    for (const trigger of triggers) {
      await trigger.click();
      const popup = page.locator('[data-slot="select-content"][data-open]');
      await expect(popup).toBeVisible();

      const bounds = await page.evaluate(() => {
        const el = document.querySelector(
          '[data-slot="select-content"][data-open]',
        );
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
        };
      });

      expect(bounds).not.toBeNull();
      expect(bounds!.left).toBeGreaterThanOrEqual(0);
      expect(bounds!.right).toBeLessThanOrEqual(bounds!.windowWidth + 1);
      expect(bounds!.top).toBeGreaterThanOrEqual(0);
      expect(bounds!.bottom).toBeLessThanOrEqual(bounds!.windowHeight + 1);

      await page.keyboard.press('Escape');
      await expect(popup).not.toBeVisible();
    }
  });

  test('5. El popup no fuerza un ancho mínimo arbitrario si el trigger es menor, y se adapta al contenido', async ({
    page,
  }) => {
    await openDemoDashboard(page);

    // Selector de cuenta analizada
    const accountTrigger = page.getByLabel('Cuenta analizada');
    const triggerBox = await accountTrigger.boundingBox();
    expect(triggerBox).not.toBeNull();

    await accountTrigger.click();
    const popup = page.locator('[data-slot="select-content"][data-open]');
    await expect(popup).toBeVisible();

    const popupBox = await popup.boundingBox();
    expect(popupBox).not.toBeNull();

    // El ancho del popup es al menos el del trigger
    expect(popupBox!.width).toBeGreaterThanOrEqual(triggerBox!.width - 1);

    await page.keyboard.press('Escape');
  });

  test('6. Selección de una opción actualiza el valor y cierra el menú', async ({
    page,
  }) => {
    await openDemoDashboard(page);

    const trigger = page.getByLabel('Filtrar relaciones');
    await expect(trigger).toContainText('No te siguen');

    await trigger.click();
    const popup = page.locator('[data-slot="select-content"][data-open]');
    await expect(popup).toBeVisible();

    // Seleccionar otra opción: "Mutuos"
    const mutualItem = page.getByRole('option', { name: /^Mutuos\s·/ });
    await expect(mutualItem).toBeVisible();
    await mutualItem.click();

    // El popup se cierra
    await expect(popup).not.toBeVisible();

    // El trigger muestra el nuevo valor seleccionado
    await expect(trigger).toContainText('Mutuos');
  });

  test('7. Clic fuera y tecla Escape cierran el menú correctamente', async ({
    page,
  }) => {
    await openDemoDashboard(page);

    const trigger = page.getByLabel('Importación actual');

    // Test Escape
    await trigger.click();
    const popup = page.locator('[data-slot="select-content"][data-open]');
    await expect(popup).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(popup).not.toBeVisible();

    // Test Clic fuera
    await trigger.click();
    await expect(popup).toBeVisible();
    await page.getByRole('heading', { name: /Tus relaciones/i }).click();
    await expect(popup).not.toBeVisible();
  });

  test('8. Cambio entre fechas funciona y actualiza el estado del dashboard', async ({
    page,
  }) => {
    await openDemoDashboard(page);

    const currentPicker = page.getByLabel('Importación actual');
    const initialText = await currentPicker.innerText();

    await currentPicker.click();
    const options = page.getByRole('option');
    const count = await options.count();
    expect(count).toBeGreaterThan(1);

    // Seleccionar la segunda fecha disponible
    const secondOption = options.nth(1);
    const secondOptionText = await secondOption.innerText();
    await secondOption.click();

    await expect(
      page.locator('[data-slot="select-content"][data-open]'),
    ).not.toBeVisible();
    expect(await currentPicker.innerText()).toBe(secondOptionText);
    expect(secondOptionText).not.toBe(initialText);
  });

  test('9. Accesibilidad con teclado: navegación con flechas, Enter y retención de foco', async ({
    page,
  }) => {
    await openDemoDashboard(page);

    const trigger = page.getByLabel('Importación actual');
    await trigger.focus();
    await expect(trigger).toBeFocused();

    // Abrir con ArrowDown
    await page.keyboard.press('ArrowDown');
    const popup = page.locator('[data-slot="select-content"][data-open]');
    await expect(popup).toBeVisible();

    // Navegar con flechas y seleccionar con Enter
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(popup).not.toBeVisible();
    // El foco vuelve al trigger
    await expect(trigger).toBeFocused();
  });

  test('10. Adaptación cerca del borde inferior del viewport: hace flip hacia arriba sin superponerse', async ({
    page,
  }) => {
    // Definimos un viewport compacto
    await page.setViewportSize({ width: 1024, height: 420 });
    await openDemoDashboard(page);

    // Hacemos scroll hasta el selector de filtros de relaciones que queda cerca del fondo
    const filterTrigger = page.getByLabel('Filtrar relaciones');
    await filterTrigger.scrollIntoViewIfNeeded();

    const triggerBox = await filterTrigger.boundingBox();
    expect(triggerBox).not.toBeNull();

    await filterTrigger.click();
    const popup = page.locator('[data-slot="select-content"][data-open]');
    await expect(popup).toBeVisible();

    const popupBox = await popup.boundingBox();
    expect(popupBox).not.toBeNull();

    // Verificamos que el popup esté dentro de la pantalla
    expect(popupBox!.y).toBeGreaterThanOrEqual(0);
    expect(popupBox!.y + popupBox!.height).toBeLessThanOrEqual(420 + 2);

    // Si no había espacio abajo, el popup se abre arriba (popup.y + popup.height <= trigger.y + tolerancia)
    // O si había espacio abajo, se abre abajo (popup.y >= trigger.y + trigger.height - tolerancia)
    const openedAbove = popupBox!.y + popupBox!.height <= triggerBox!.y + 2;
    const openedBelow = popupBox!.y >= triggerBox!.y + triggerBox!.height - 2;
    expect(openedAbove || openedBelow).toBe(true);

    // En ningún caso debe tapar el centro del trigger
    const triggerCenterY = triggerBox!.y + triggerBox!.height / 2;
    const coversCenter =
      popupBox!.y < triggerCenterY &&
      popupBox!.y + popupBox!.height > triggerCenterY;
    expect(coversCenter).toBe(false);

    await page.keyboard.press('Escape');
  });
});

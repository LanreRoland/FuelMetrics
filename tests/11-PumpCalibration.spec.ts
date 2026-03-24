import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
  type AuthResult,
} from './helpers/epump';

const EPUMP_PASSWORD = process.env.EPUMP_PASSWORD || 'Tester.1';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactTextRegex(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, 'i');
}

// The portal mixes links, buttons, and custom controls, so these helpers
// normalize "find the first visible thing and click it" behavior.
async function firstVisible(page: Page, candidates: Locator[], timeoutMs = 20_000): Promise<Locator | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    for (const locator of candidates) {
      if (await locator.isVisible().catch(() => false)) {
        return locator;
      }
    }

    await page.waitForTimeout(500);
  }

  return null;
}

async function clickVisible(page: Page, candidates: Locator[], description: string): Promise<void> {
  const target = await firstVisible(page, candidates);
  if (!target) {
    throw new Error(`Could not find a visible control for: ${description}`);
  }

  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click().catch(async () => {
    await target.click({ force: true });
  });
}

// Authentication is the flakiest part of the live site, so we retry the
// shared login helper before giving up and skipping the test.
async function authenticateWithRetry(page: Page, attempts = 2): Promise<AuthResult> {
  let lastResult: AuthResult = { ok: false, reason: 'Authentication was not attempted.' };

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await ensureAuthenticated(page);
    if (result.ok) {
      return result;
    }

    lastResult = result;
    console.warn(`[ warn ] Authentication attempt ${attempt}/${attempts} failed: ${result.reason}`);

    if (attempt < attempts) {
      await page.goto('https://stations.epump.africa/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(5_000);
    }
  }

  return lastResult;
}

// Navigation supports both the visible sidebar path and a direct route fallback
// because this app sometimes lands on Pump Calibration without expanding menus.
async function openPumpCalibrationPage(page: Page): Promise<void> {
  await clickVisible(
    page,
    [
      page.getByRole('link', { name: /Pump management/i }).first(),
      page.getByRole('button', { name: /Pump management/i }).first(),
      page.locator('a, button, [role="button"]').filter({ hasText: /Pump management/i }).first(),
    ],
    'Pump management',
  );

  await page.waitForTimeout(2_000);

  const calibrationCandidates = [
    page.getByRole('link', { name: /Pump calibration/i }).first(),
    page.getByRole('button', { name: /Pump calibration/i }).first(),
    page.locator('a, button, [role="button"]').filter({ hasText: /Pump calibration/i }).first(),
  ];

  if (await firstVisible(page, calibrationCandidates, 10_000)) {
    await clickVisible(page, calibrationCandidates, 'Pump calibration');
  } else {
    const calibrationHref = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      const match = anchors.find((anchor) => {
        const text = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
        const href = anchor.getAttribute('href') || '';
        return /pump calibration/i.test(text) || /calibr/i.test(href);
      });

      return match?.getAttribute('href') || null;
    });

    if (!calibrationHref) {
      throw new Error('Pump calibration entry was not visible and no calibration route was discovered.');
    }

    await page.goto(calibrationHref.startsWith('http') ? calibrationHref : `https://stations.epump.africa${calibrationHref}`, {
      waitUntil: 'domcontentloaded',
    });
  }

  await expect(
    firstVisible(page, [
      page.getByRole('heading', { name: /Pump calibration/i }).first(),
      page.getByText(/Pump calibration/i).first(),
      page.getByRole('button', { name: /^Calibrate$/i }).first(),
    ]),
  ).resolves.not.toBeNull();
}

// The top-level page button opens the actual calibration drawer where the form
// fields for region, state, outlets, pumps, and calibration value live.
async function openCalibrationDrawer(page: Page): Promise<void> {
  await clickVisible(
    page,
    [
      page.getByRole('button', { name: /^Calibrate$/i }).first(),
      page.locator('button, [role="button"]').filter({ hasText: /^Calibrate$/i }).first(),
    ],
    'open calibration form',
  );

  await expect(
    firstVisible(page, [
      page.locator('button, [role="button"], [role="combobox"]').filter({ hasText: /Select Region/i }).first(),
      page.getByRole('button', { name: /Select Region/i }).first(),
      page.locator('button, [role="button"], [role="combobox"]').filter({ hasText: /Select states/i }).first(),
    ]),
  ).resolves.not.toBeNull();
}

// The app renders dropdown overlays in a few different containers, so we
// resolve the active one first and then search inside it.
async function visibleOverlay(page: Page): Promise<Locator> {
  const overlayCandidates = [
    page.locator('.p-multiselect-panel:visible').last(),
    page.locator('.p-dropdown-panel:visible').last(),
    page.locator('.p-select-overlay:visible').last(),
    page.locator('.p-component-overlay:visible').last(),
    page.locator('[role="listbox"]:visible').last(),
    page.locator('[role="dialog"]:visible').last(),
  ];

  const overlay = await firstVisible(page, overlayCandidates, 3_000);
  return overlay || page.locator('body');
}

// These helpers handle the custom multi-select widgets used across the drawer.
async function openSelect(page: Page, label: RegExp): Promise<void> {
  await clickVisible(
    page,
    [
      page.getByRole('button', { name: label }).first(),
      page.locator('button, [role="button"], [role="combobox"]').filter({ hasText: label }).first(),
      page.getByText(label).first(),
    ],
    String(label),
  );

  await page.waitForTimeout(1_000);
}

async function clickDropdownOption(page: Page, option: string): Promise<void> {
  const optionRegex = exactTextRegex(option);
  const overlay = await visibleOverlay(page);
  const searchInput = overlay.locator('input[placeholder*="Search" i], input[type="search"]').last();

  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill(option);
    await page.waitForTimeout(500);
  }

  const candidates = [
    overlay.getByRole('option', { name: optionRegex }).first(),
    overlay.getByRole('listitem').filter({ hasText: optionRegex }).first(),
    overlay.locator('li').filter({ hasText: optionRegex }).first(),
    overlay.locator('button, div, span').filter({ hasText: optionRegex }).first(),
    page.getByRole('option', { name: optionRegex }).first(),
    page.getByRole('listitem').filter({ hasText: optionRegex }).first(),
  ];

  await clickVisible(page, candidates, option);

  if (await searchInput.isVisible().catch(() => false)) {
    await searchInput.fill('');
  }
}

async function chooseMultiSelectOptions(page: Page, label: RegExp, options: string[]): Promise<void> {
  await openSelect(page, label);

  for (const option of options) {
    const overlay = await visibleOverlay(page);
    if (!(await overlay.isVisible().catch(() => false))) {
      await openSelect(page, label);
    }

    await clickDropdownOption(page, option);
    await page.waitForTimeout(750);
  }

  await page.keyboard.press('Escape').catch(() => {});
}

async function clickSelectAll(
  page: Page,
  label: RegExp,
  fallbackOptions: string[] = [],
  acceptExistingSelection?: RegExp,
): Promise<void> {
  await openSelect(page, label);

  const overlay = await visibleOverlay(page);
  const selectAllCandidates = [
    overlay.getByRole('button', { name: /Select all/i }).last(),
    overlay.locator('button, [role="button"]').filter({ hasText: /Select all/i }).last(),
    page.getByRole('button', { name: /Select all/i }).last(),
    page.locator('button, [role="button"]').filter({ hasText: /Select all/i }).last(),
  ];

  const selectAllButton = await firstVisible(page, selectAllCandidates, 5_000);
  if (selectAllButton) {
    await selectAllButton.click().catch(async () => {
      await selectAllButton.click({ force: true });
    });
    await page.waitForTimeout(1_000);
    await page.keyboard.press('Escape').catch(() => {});
    return;
  }

  for (const option of fallbackOptions) {
    const optionRegex = exactTextRegex(option);
    const optionCandidates = [
      overlay.getByRole('option', { name: optionRegex }).first(),
      overlay.getByRole('listitem').filter({ hasText: optionRegex }).first(),
      overlay.locator('li, button, div, span').filter({ hasText: optionRegex }).first(),
      page.getByRole('option', { name: optionRegex }).first(),
      page.getByRole('listitem').filter({ hasText: optionRegex }).first(),
      page.locator('li, button, div, span').filter({ hasText: optionRegex }).last(),
    ];
    const target = await firstVisible(page, optionCandidates, 3_000);
    if (target) {
      await target.click().catch(async () => {
        await target.click({ force: true });
      });
      await page.waitForTimeout(1_000);
      await page.keyboard.press('Escape').catch(() => {});
      return;
    }
  }

  if (acceptExistingSelection) {
    const existingSelection = await firstVisible(page, [
      page.locator('button, [role="button"]').filter({ hasText: acceptExistingSelection }).last(),
      page.getByRole('button', { name: acceptExistingSelection }).last(),
    ], 3_000);

    if (existingSelection) {
      await page.keyboard.press('Escape').catch(() => {});
      return;
    }
  }

  throw new Error(`Could not find a visible control for: Select all for ${String(label)}`);
}

// Pump selection is special because it uses checkbox rows instead of a simple
// chip picker, so we confirm at least one checkbox is actually selected.
async function selectAllPumps(page: Page): Promise<void> {
  await clickVisible(
    page,
    [
      page.getByRole('button', { name: /^Pumps$/i }).last(),
      page.locator('button, [role="button"]').filter({ hasText: /^Pumps$/i }).last(),
      page.getByText(/Select pumps/i).first(),
    ],
    'Select pumps',
  );

  const selectAllButton = await firstVisible(page, [
    page.getByRole('button', { name: /Select all/i }).last(),
    page.locator('button, [role="button"]').filter({ hasText: /Select all/i }).last(),
  ], 10_000);

  if (!selectAllButton) {
    throw new Error('The pump selection list opened, but the Select all action was not visible.');
  }

  await selectAllButton.click().catch(async () => {
    await selectAllButton.click({ force: true });
  });

  await expect.poll(async () => {
    return page.locator('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked').count().catch(() => 0);
  }, { timeout: 15_000 }).toBeGreaterThan(0);

  await page.keyboard.press('Escape').catch(() => {});
}

// Calibration can appear either as a native range input or a custom slider,
// so we support both implementations before submitting the form.
async function setCalibrationValue(page: Page, targetValue = 0.4): Promise<void> {
  const visibleRange = await firstVisible(page, [
    page.locator('input[type="range"]').first(),
    page.getByRole('slider').first(),
    page.locator('[role="slider"]').first(),
    page.locator('.p-slider-handle').first(),
  ]);

  if (!visibleRange) {
    throw new Error('No visible calibration slider was found.');
  }

  const rangeInput = page.locator('input[type="range"]').first();
  if (await rangeInput.isVisible().catch(() => false)) {
    await rangeInput.evaluate((node, value) => {
      const input = node as HTMLInputElement;
      input.value = String(value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, targetValue);
    await page.waitForTimeout(1_000);
    return;
  }

  const slider = visibleRange;
  const sliderHandle = (await slider.getAttribute('role')) === 'slider'
    ? slider
    : page.getByRole('slider').first();

  const ariaNow = Number(await sliderHandle.getAttribute('aria-valuenow'));
  const ariaMin = Number(await sliderHandle.getAttribute('aria-valuemin'));
  const ariaMax = Number(await sliderHandle.getAttribute('aria-valuemax'));

  if (!Number.isNaN(ariaNow) && !Number.isNaN(ariaMin) && !Number.isNaN(ariaMax)) {
    await sliderHandle.focus();
    const absoluteTarget = ariaMax <= 1.5 ? targetValue : ariaMin + targetValue * (ariaMax - ariaMin);
    const directionKey = absoluteTarget >= ariaNow ? 'ArrowRight' : 'ArrowLeft';
    const steps = Math.min(25, Math.max(1, Math.round(Math.abs(absoluteTarget - ariaNow) / Math.max((ariaMax - ariaMin) / 10, 0.1))));

    for (let index = 0; index < steps; index += 1) {
      await page.keyboard.press(directionKey).catch(() => {});
    }
    await page.waitForTimeout(1_000);
    return;
  }

  const track = slider.locator('xpath=..').first();
  const box = (await track.boundingBox()) || (await slider.boundingBox());
  if (!box) {
    throw new Error('Calibration slider was found but its position could not be determined.');
  }

  const targetX = box.x + box.width * targetValue;
  const targetY = box.y + box.height / 2;
  await page.mouse.click(targetX, targetY);
  await page.waitForTimeout(1_000);
}

test.describe('Pump Calibration Automation', () => {
  test.setTimeout(420_000);

  test('should calibrate all selected pumps for West region Lagos and Ekiti outlets', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    // Authenticate first, then open the calibration drawer from the sidebar flow.
    const auth = await authenticateWithRetry(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, auth.reason);
    }

    await openPumpCalibrationPage(page);
    await openCalibrationDrawer(page);

    // Scope the calibration request to the requested region, states, outlets, and pumps.
    await chooseMultiSelectOptions(page, /Select Region/i, ['West']);
    await chooseMultiSelectOptions(page, /Select states/i, ['Lagos', 'Ekiti']);
    await clickSelectAll(page, /Select retail outlets/i);
    await selectAllPumps(page);

    // Set the requested calibration value, then authorize the action in the password modal.
    await setCalibrationValue(page, 0.4);

    const calibrateButton = await firstVisible(page, [
      page.getByRole('button', { name: /^Calibrate$/i }).last(),
      page.locator('button, [role="button"]').filter({ hasText: /^Calibrate$/i }).last(),
      page.locator('button, [role="button"]').filter({ hasText: /Calibrate/i }).last(),
    ]);
    if (!calibrateButton) {
      await page.screenshot({ path: 'pump-calibration-before-submit.png', fullPage: true });
      throw new Error('The green Calibrate button was not visible after setting the calibration value.');
    }

    await expect(calibrateButton).toBeEnabled({ timeout: 20_000 });

    await calibrateButton.click().catch(async () => {
      await calibrateButton.click({ force: true });
    });

    const modalPassword = await firstVisible(page, [
      page.locator('input[type="password"]').last(),
      page.locator('input[placeholder*="password" i]').last(),
    ], 20_000);

    if (!modalPassword) {
      await page.screenshot({ path: 'pump-calibration-password-modal-missing.png', fullPage: true });
      throw new Error('The password confirmation modal did not appear after clicking Calibrate.');
    }

    await modalPassword.fill(EPUMP_PASSWORD);

    await clickVisible(
      page,
      [
        page.getByRole('button', { name: /Confirm|Calibrate|Proceed|Submit/i }).last(),
        page.locator('button, [role="button"]').filter({ hasText: /Confirm|Calibrate|Proceed|Submit/i }).last(),
      ],
      'password confirmation',
    );

    await expect(modalPassword).not.toBeVisible({ timeout: 30_000 });
    await assertStatusCodeAudit(page, statusAudit, '11-PumpCalibration.spec.ts');
  });
});

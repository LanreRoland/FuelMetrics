import { test, expect, type Locator, type Page, type Response } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
  type AuthResult,
  type StatusCodeAudit,
} from './helpers/epump';

const EPUMP_PASSWORD = process.env.EPUMP_PASSWORD || 'Tester.1';
const EPUMP_ORIGIN = new URL(process.env.EPUMP_URL || 'https://stations.epump.africa/login').origin;
const FINAL_ACTION_SETTLE_MS = 5_000;
const ACCESS_DENIED_TEXT = /Your account does not have access to this Data/i;

type FinalActionResponse = {
  url: string;
  status: number;
  method: string;
  resourceType: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactTextRegex(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegex(value)}\\s*$`, 'i');
}

// The live portal mixes links, buttons, and custom div-based controls, so the
// helpers below always resolve the first visible candidate before acting.
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

// Login on the live site can hang intermittently, so retry once before
// skipping the test entirely.
async function authenticateWithRetry(page: Page, attempts = 3): Promise<AuthResult> {
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

// The recording shows the user reaching Shutdown Pump from Pump management,
// with a direct route fallback available when the submenu is not rendered.
async function openShutdownPumpPage(page: Page): Promise<void> {
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

  const shutdownCandidates = [
    page.getByRole('link', { name: /Shutdown Pump/i }).first(),
    page.getByRole('button', { name: /Shutdown Pump/i }).first(),
    page.locator('a, button, [role="button"]').filter({ hasText: /Shutdown Pump/i }).first(),
  ];

  if (await firstVisible(page, shutdownCandidates, 10_000)) {
    await clickVisible(page, shutdownCandidates, 'Shutdown Pump');
  } else {
    const shutdownHref = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a'));
      const match = anchors.find((anchor) => {
        const text = (anchor.textContent || '').replace(/\s+/g, ' ').trim();
        const href = anchor.getAttribute('href') || '';
        return /shutdown pump/i.test(text) || /shutdown-pump/i.test(href);
      });

      return match?.getAttribute('href') || null;
    });

    await page.goto(
      shutdownHref?.startsWith('http') ? shutdownHref : `https://stations.epump.africa${shutdownHref || '/shutdown-pump'}`,
      { waitUntil: 'domcontentloaded' },
    );
  }

  await expect(
    firstVisible(page, [
      page.getByRole('heading', { name: /Shutdown Pump/i }).first(),
      page.getByText(/Shutdown Pump/i).first(),
      page.getByRole('button', { name: /^Shutdown Pump$/i }).first(),
    ]),
  ).resolves.not.toBeNull();
}

// The video shows a page-level "Shutdown Pump" button that opens the drawer.
// Some runs land with the drawer already open, so support both states.
async function openShutdownDrawer(page: Page): Promise<void> {
  const drawerAlreadyOpen = await firstVisible(page, [
    page.getByRole('button', { name: /Select Region/i }).first(),
    page.locator('button, [role="button"], [role="combobox"]').filter({ hasText: /Select Region/i }).first(),
  ], 5_000);

  if (!drawerAlreadyOpen) {
    await clickVisible(
      page,
      [
        page.getByRole('button', { name: /^Shutdown Pump$/i }).first(),
        page.locator('button, [role="button"]').filter({ hasText: /^Shutdown Pump$/i }).first(),
      ],
      'open shutdown drawer',
    );
  }

  await expect(
    firstVisible(page, [
      page.locator('button, [role="button"], [role="combobox"]').filter({ hasText: /Select Region/i }).first(),
      page.getByRole('button', { name: /Select states/i }).first(),
      page.locator('textarea, input').filter({ hasText: /Reason/i }).first(),
    ]),
  ).resolves.not.toBeNull();
}

// The portal renders its dropdown panels in different containers, so resolve
// the active overlay first, then search inside it.
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

// The recording shows the retail outlet list exposing a "Select all" action.
// If that control is absent, we fall back to clicking visible options.
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

  await page.keyboard.press('Escape').catch(() => {});
  throw new Error(`Could not find a visible control for: Select all for ${String(label)}`);
}

// Pumps use checkbox rows inside the overlay, so confirm that at least one row
// became selected after the bulk action.
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

  if (selectAllButton) {
    await selectAllButton.click().catch(async () => {
      await selectAllButton.click({ force: true });
    });
  } else {
    const overlay = await visibleOverlay(page);
    const checkboxRows = overlay.locator('[role="checkbox"], input[type="checkbox"]');
    const count = await checkboxRows.count().catch(() => 0);
    if (count === 0) {
      throw new Error('The pump selection list opened, but no selectable pumps were visible.');
    }

    for (let index = 0; index < count; index += 1) {
      const row = checkboxRows.nth(index);
      const isChecked = await row.getAttribute('aria-checked').catch(() => null);
      if (isChecked !== 'true') {
        await row.click().catch(async () => {
          await row.click({ force: true });
        });
        await page.waitForTimeout(300);
      }
    }
  }

  await expect.poll(async () => {
    return page.locator('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked').count().catch(() => 0);
  }, { timeout: 15_000 }).toBeGreaterThan(0);

  await page.keyboard.press('Escape').catch(() => {});
}

async function fillShutdownReason(page: Page, value: string): Promise<void> {
  const reasonField = await firstVisible(page, [
    page.locator('textarea[placeholder*="reason" i]').first(),
    page.locator('input[placeholder*="reason" i]').first(),
    page.locator('textarea').last(),
  ], 10_000);

  if (!reasonField) {
    throw new Error('The shutdown reason field was not visible.');
  }

  await reasonField.fill(value);
}

async function visibleErrorToast(page: Page): Promise<string | null> {
  const toast = await firstVisible(page, [
    page.locator('.p-toast-message-error').last(),
    page.locator('[role="alert"]').filter({ hasText: /Error|access/i }).last(),
    page.getByText(ACCESS_DENIED_TEXT).last(),
  ], 1_000);

  if (!toast) {
    return null;
  }

  const text = (await toast.textContent().catch(() => '')) || '';
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized || 'An error toast appeared after the shutdown action.';
}

// The final password confirmation is where the mutation happens. Track direct
// responses after the click and fail immediately if the UI surfaces the same
// access error seen in the recording.
async function submitShutdownConfirmation(
  page: Page,
  modalPassword: Locator,
  statusAudit: StatusCodeAudit,
): Promise<void> {
  const baselineFailureCount = statusAudit.getFailures().length;
  const observedResponses: FinalActionResponse[] = [];
  const responseHandler = (response: Response) => {
    const request = response.request();
    const method = request.method().toUpperCase();
    const resourceType = request.resourceType();

    if (!response.url().startsWith(EPUMP_ORIGIN)) {
      return;
    }

    if (!['document', 'fetch', 'xhr'].includes(resourceType)) {
      return;
    }

    if (['OPTIONS', 'HEAD'].includes(method)) {
      return;
    }

    observedResponses.push({
      url: response.url(),
      status: response.status(),
      method,
      resourceType,
    });
  };

  page.on('response', responseHandler);

  try {
    await clickVisible(
      page,
      [
        page.getByRole('button', { name: /^Shutdown$/i }).last(),
        page.locator('button, [role="button"]').filter({ hasText: /^Shutdown$/i }).last(),
        page.locator('button, [role="button"]').filter({ hasText: /Confirm|Proceed|Submit/i }).last(),
      ],
      'shutdown password confirmation',
    );

    const deadline = Date.now() + 30_000;
    let modalClosed = false;

    while (Date.now() < deadline) {
      const newFailures = statusAudit.getFailures().slice(baselineFailureCount);
      if (newFailures.length > 0) {
        const firstFailure = newFailures[0];
        throw new Error(
          `Pump shutdown confirmation returned ${firstFailure.status} for ${firstFailure.method} ${firstFailure.url}`,
        );
      }

      const toastMessage = await visibleErrorToast(page);
      if (toastMessage) {
        throw new Error(`Pump shutdown was rejected: ${toastMessage}`);
      }

      if (!(await modalPassword.isVisible().catch(() => false))) {
        modalClosed = true;
        break;
      }

      await page.waitForTimeout(500);
    }

    if (!modalClosed) {
      throw new Error('Pump shutdown confirmation did not complete before timeout.');
    }

    const settleDeadline = Date.now() + FINAL_ACTION_SETTLE_MS;
    while (Date.now() < settleDeadline) {
      const newFailures = statusAudit.getFailures().slice(baselineFailureCount);
      if (newFailures.length > 0) {
        const firstFailure = newFailures[0];
        throw new Error(
          `Pump shutdown confirmation returned ${firstFailure.status} for ${firstFailure.method} ${firstFailure.url}`,
        );
      }

      const toastMessage = await visibleErrorToast(page);
      if (toastMessage) {
        throw new Error(`Pump shutdown was rejected: ${toastMessage}`);
      }

      await page.waitForTimeout(500);
    }

    if (observedResponses.length === 0) {
      throw new Error('No same-origin response was captured after the final pump shutdown confirmation click.');
    }

    const invalidResponse = observedResponses.find((response) => ![200, 201].includes(response.status));
    if (invalidResponse) {
      throw new Error(
        `Pump shutdown final action returned ${invalidResponse.status} for ${invalidResponse.method} ${invalidResponse.url}`,
      );
    }
  } finally {
    page.off('response', responseHandler);
  }
}

test.describe('Pump Shutdown Automation', () => {
  test.setTimeout(420_000);

  test('should submit the recorded shutdown pump flow for West region Lagos', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);

    // Authenticate first, then open the recorded shutdown-pump flow.
    const auth = await authenticateWithRetry(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, auth.reason);
    }

    await openShutdownPumpPage(page);
    await openShutdownDrawer(page);

    // Recreate the drawer selections shown in the recording.
    await chooseMultiSelectOptions(page, /Select Region/i, ['West']);
    await chooseMultiSelectOptions(page, /Select states/i, ['Lagos']);
    await clickSelectAll(page, /Select retail outlets/i, ['Outlet Demo', 'Outlet demo 4', 'Demo 2'], /Demo/i);
    await selectAllPumps(page);
    await fillShutdownReason(page, 'No reason');

    const shutdownButton = await firstVisible(page, [
      page.getByRole('button', { name: /^Shutdown$/i }).first(),
      page.locator('button, [role="button"]').filter({ hasText: /^Shutdown$/i }).first(),
    ], 15_000);

    if (!shutdownButton) {
      await page.screenshot({ path: 'shutdown-pump-before-submit.png', fullPage: true });
      throw new Error('The green Shutdown button was not visible after filling the shutdown form.');
    }

    await expect(shutdownButton).toBeEnabled({ timeout: 20_000 });

    await shutdownButton.click().catch(async () => {
      await shutdownButton.click({ force: true });
    });

    const modalPassword = await firstVisible(page, [
      page.locator('input[type="password"]').last(),
      page.locator('input[placeholder*="password" i]').last(),
    ], 20_000);

    if (!modalPassword) {
      await page.screenshot({ path: 'shutdown-pump-password-modal-missing.png', fullPage: true });
      throw new Error('The password confirmation modal did not appear after clicking Shutdown.');
    }

    await modalPassword.fill(EPUMP_PASSWORD);
    await submitShutdownConfirmation(page, modalPassword, statusAudit);
    await assertStatusCodeAudit(page, statusAudit, '12-ShutdownPump.spec.ts');
  });
});

import type { Locator, Page } from '@playwright/test';

const EPUMP_URL = process.env.EPUMP_URL ?? 'https://stations.epump.africa/login';
const EPUMP_EMAIL = process.env.EPUMP_EMAIL ?? 'mikeandmike@mailinator.com';
const EPUMP_PASSWORD = process.env.EPUMP_PASSWORD ?? 'Tester.1';

const NAVIGATION_TIMEOUT_MS = 90_000;
const READY_TIMEOUT_MS = 90_000;
const DASHBOARD_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 1_000;

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: string };

export function emailInput(page: Page): Locator {
  return page
    .locator(
      'input[type="email"], input[name*="email" i], input[name*="username" i], [placeholder*="email" i]',
    )
    .first();
}

export function passwordInput(page: Page): Locator {
  return page
    .locator('input[type="password"], input[name*="password" i], [placeholder*="password" i]')
    .first();
}

export function signInButton(page: Page): Locator {
  return page.getByRole('button', { name: /Sign in|Sign-in|Login|loading/i }).first();
}

export function priceManagementLink(page: Page): Locator {
  return page.getByRole('link', { name: /Price management/i }).first();
}

export function dashboardHeading(page: Page): Locator {
  return page.getByRole('heading', { name: /Dashboard/i }).first();
}

export async function ensureAuthenticated(page: Page): Promise<AuthResult> {
  const sessionSurface = await openPortal(page);
  if (sessionSurface === 'unavailable') {
    return {
      ok: false,
      reason: `The ePump portal did not become interactive within ${READY_TIMEOUT_MS / 1000}s.`,
    };
  }

  if (sessionSurface === 'dashboard') {
    return { ok: true };
  }

  await emailInput(page).fill(EPUMP_EMAIL);
  await passwordInput(page).fill(EPUMP_PASSWORD);
  await signInButton(page).click();
  console.log('[ info ] Sign-in clicked. Waiting for dashboard or hang...');

  // If it hangs on the spinner, try direct navigation after 20s
  const dashboardReached = await waitForDashboard(page, 30000);
  if (dashboardReached) {
    return { ok: true };
  }

  console.log('[ info ] Dashboard not reached in 30s. Attempting direct navigation fallback...');
  await page.goto('https://stations.epump.africa/Dashboard', { waitUntil: 'domcontentloaded' }).catch(() => {});
  
  if (await waitForDashboard(page, DASHBOARD_TIMEOUT_MS)) {
    return { ok: true };
  }

  const currentUrl = page.url();
  const visibleText = await bodyTextSnippet(page);
  return {
    ok: false,
    reason: visibleText
      ? `Login did not reach the dashboard. URL: ${currentUrl}. Visible page text: ${visibleText}`
      : `Login did not reach the dashboard. URL: ${currentUrl}.`,
  };
}

export async function openPortal(page: Page): Promise<'login' | 'dashboard' | 'unavailable'> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await page.goto(EPUMP_URL, { waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT_MS });
    } catch {
      // The portal can still render after goto times out, so rely on DOM readiness below.
    }

    const surface = await waitForSessionSurface(page, READY_TIMEOUT_MS);
    if (surface) {
      return surface;
    }

    if (attempt < 2) {
      await page.waitForTimeout(POLL_INTERVAL_MS);
    }
  }

  return 'unavailable';
}

export async function waitForDashboard(page: Page, timeoutMs = DASHBOARD_TIMEOUT_MS): Promise<boolean> {
  return waitForPredicate(async () => isDashboardReady(page), timeoutMs);
}

export async function waitForVisible(locator: Locator, timeoutMs = 60_000): Promise<boolean> {
  return waitForPredicate(async () => locator.isVisible().catch(() => false), timeoutMs);
}

export async function openPriceLogPage(page: Page): Promise<boolean> {
  if (!(await openNestedNavigation(page, /Price Log/i))) {
    return false;
  }

  return waitForPredicate(
    async () =>
      page.url().toLowerCase().includes('log') ||
      (await page.getByRole('button', { name: /Update Price/i }).first().isVisible().catch(() => false)),
    60_000,
  );
}

export async function openPriceApprovalPage(page: Page): Promise<boolean> {
  if (!(await openNestedNavigation(page, /Price approval/i))) {
    return false;
  }

  return waitForPredicate(
    async () =>
      page.url().toLowerCase().includes('approval') ||
      (await page.getByRole('button', { name: /Approve/i }).first().isVisible().catch(() => false)),
    60_000,
  );
}

async function openNestedNavigation(page: Page, linkName: RegExp): Promise<boolean> {
  const targetLink = page.getByRole('link', { name: linkName }).first();
  if (!(await waitForVisible(targetLink, 15_000))) {
    const menu = priceManagementLink(page);
    if (!(await waitForVisible(menu, 60_000))) {
      return false;
    }
    await menu.click();
  }

  if (!(await waitForVisible(targetLink, 30_000))) {
    return false;
  }

  await targetLink.click();
  return true;
}

async function waitForSessionSurface(
  page: Page,
  timeoutMs: number,
): Promise<'login' | 'dashboard' | null> {
  const deadline = Date.now() + timeoutMs;
  console.log(`[ info ] Waiting for session surface (deadline in ${timeoutMs/1000}s)...`);

  while (Date.now() < deadline) {
    const url = page.url();
    if (await isDashboardReady(page)) {
      console.log(`[ info ] Dashboard surface detected at ${url}`);
      return 'dashboard';
    }

    if (await emailInput(page).isVisible().catch(() => false)) {
      console.log(`[ info ] Login surface detected at ${url}`);
      return 'login';
    }

    // Check for landing page redirect
    if (url.includes('epump.com.ng') || (await page.getByRole('button', { name: /Login/i }).isVisible().catch(() => false))) {
        console.log(`[ info ] Landing page detected at ${url}. Attempting to click Login link...`);
        const loginBtn = page.getByRole('button', { name: /Login/i }).first();
        if (await loginBtn.isVisible()) {
            await loginBtn.click().catch(() => {});
        } else {
            const loginLink = page.getByRole('link', { name: /Login/i }).first();
            await loginLink.click().catch(() => {});
        }
    }

    await page.waitForTimeout(POLL_INTERVAL_MS * 2);
  }

  console.error(`[ error ] Timeout waiting for session surface at ${page.url()}`);
  return null;
}

async function isDashboardReady(page: Page): Promise<boolean> {
  if (page.url().toLowerCase().includes('dashboard')) {
    return true;
  }

  return (
    (await priceManagementLink(page).isVisible().catch(() => false)) ||
    (await dashboardHeading(page).isVisible().catch(() => false))
  );
}

async function bodyTextSnippet(page: Page): Promise<string> {
  const text = await page.locator('body').innerText().catch(() => '');
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

async function waitForPredicate(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await predicate()) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return false;
}

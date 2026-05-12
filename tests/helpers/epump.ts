import { expect, type Locator, type Page, type Response } from '@playwright/test';

const EPUMP_URL = (process.env.EPUMP_URL || 'https://stations.epump.africa/login').trim() || 'https://stations.epump.africa/login';
const EPUMP_EMAIL = process.env.EPUMP_EMAIL || 'mikeandmike@mailinator.com';
const EPUMP_PASSWORD = process.env.EPUMP_PASSWORD || 'Tester.1';
const EPUMP_ORIGIN = new URL(EPUMP_URL).origin;

const NAVIGATION_TIMEOUT_MS = 60_000;
const READY_TIMEOUT_MS = 60_000;
const DASHBOARD_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 500;
const STATUS_AUDIT_SETTLE_MS = 2_000;
const LOGIN_WAIT_MS = 15_000;
const ALLOWED_RESPONSE_STATUSES = new Set([200, 201]);
const TRACKED_RESOURCE_TYPES = new Set(['document', 'fetch', 'xhr']);
const IGNORED_HTTP_METHODS = new Set(['OPTIONS', 'HEAD']);
const BROWSER_ERROR_PATTERNS = [
  /this site can'?t be reached/i,
  /took too long to respond/i,
  /err_(?:timed_out|connection_timed_out|connection_reset|name_not_resolved|network_changed)/i,
  /checking the connection/i,
  /checking the proxy and the firewall/i,
  /running windows network diagnostics/i,
];

export type AuthResult =
  | { ok: true }
  | { ok: false; reason: string };

export type StatusAuditFailure = {
  url: string;
  status: number;
  method: string;
  resourceType: string;
};

export type StatusCodeAudit = {
  getFailures: () => StatusAuditFailure[];
  reset: () => void;
  stop: () => void;
};

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

export function startStatusCodeAudit(page: Page): StatusCodeAudit {
  const failures: StatusAuditFailure[] = [];
  const seen = new Set<string>();
  let active = true;

  const handler = (response: Response) => {
    if (!active || !shouldTrackResponse(response)) {
      return;
    }

    const status = response.status();
    if (ALLOWED_RESPONSE_STATUSES.has(status)) {
      return;
    }

    const request = response.request();
    const failure = {
      url: response.url(),
      status,
      method: request.method(),
      resourceType: request.resourceType(),
    };
    const key = `${failure.status}|${failure.method}|${failure.resourceType}|${failure.url}`;

    if (!seen.has(key)) {
      seen.add(key);
      failures.push(failure);
    }
  };

  page.on('response', handler);

  return {
    getFailures: () => [...failures],
    reset: () => {
      failures.length = 0;
      seen.clear();
    },
    stop: () => {
      if (!active) {
        return;
      }

      active = false;
      page.off('response', handler);
    },
  };
}

export async function assertStatusCodeAudit(
  page: Page,
  audit: StatusCodeAudit,
  context: string,
): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: STATUS_AUDIT_SETTLE_MS }).catch(() => {});
  audit.stop();

  const failures = audit.getFailures();
  expect(
    failures,
    `${context} observed non-200/201 same-origin responses:\n${formatStatusAuditFailures(failures)}`,
  ).toEqual([]);
}

export async function ensureAuthenticated(page: Page, email?: string, password?: string, _retryAttempted = false): Promise<AuthResult> {
  // CRITICAL FIX: Validate page is open before proceeding
  if (page.isClosed()) {
    return {
      ok: false,
      reason: 'Page context is closed. Cannot authenticate.',
    };
  }

  const sessionSurface = await openPortal(page);
  if (sessionSurface === 'unavailable') {
    const unavailableReason = await portalUnavailableReason(page);
    return {
      ok: false,
      reason: unavailableReason || `The ePump portal did not become interactive within ${READY_TIMEOUT_MS / 1000}s.`,
    };
  }

  const targetEmail = email || EPUMP_EMAIL;
  const isTargetAdmin = targetEmail.toLowerCase().includes('fuelmetrics') || targetEmail.toLowerCase().includes('olarenwaju');

  if (sessionSurface === 'dashboard') {
    const currentUrl = page.url();
    const currentIsAdmin = currentUrl.includes('/stations');
    
    if (isTargetAdmin !== currentIsAdmin || email) {
      console.log(`[ info ] Resetting session to ensure clean login as ${targetEmail}.`);
      await logout(page);
      return ensureAuthenticated(page, email, password, _retryAttempted);
    }
    return { ok: true };
  }

  // Login attempt
  console.log(`[ info ] Attempting login as ${targetEmail}...`);
  const emailField = emailInput(page);
  const passwordField = passwordInput(page);
  const signBtn = signInButton(page);

  // Verify fields exist
  const emailVisible = await waitForVisible(emailField, 5000);
  if (!emailVisible) {
    return { ok: false, reason: 'Email input field not found on login page' };
  }

  console.log(`[ info ] Filling credentials for: ${targetEmail}`);
  await emailField.clear(); // Clear before filling
  await emailField.fill(targetEmail);
  await passwordField.clear(); // Clear before filling
  await passwordField.fill(password || EPUMP_PASSWORD);
  
  // Wait a moment for form to process input
  await page.waitForTimeout(500);
  
  // Verify values were filled
  const emailValue = await emailField.evaluate((el: any) => el.value);
  const passwordValue = await passwordField.evaluate((el: any) => el.value);
  console.log(`[ info ] Email field value: ${emailValue ? '✅ filled' : '❌ empty'}`);
  console.log(`[ info ] Password field value: ${passwordValue ? '✅ filled' : '❌ empty'}`);
  
  if (!emailValue || !passwordValue) {
    console.warn(`[ warn ] Fields not properly filled. Email: ${!!emailValue}, Password: ${!!passwordValue}`);
  }

  // Add small delay before clicking
  await signBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log(`[ info ] Clicking sign-in button...`);
  
  // Click with guarantee - try multiple methods
  try {
    await signBtn.click();
  } catch (e) {
    console.warn(`[ warn ] First click failed, trying alternative method`);
    await signBtn.evaluate((el: any) => el.click()); // Direct JS click
  }
  
  // Listen for network activity
  const navigationPromise = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {
    console.log('[ info ] Navigation event did not fire (page may have stayed same)');
  });

  // Wait for Network Idle or new URL or form disappearance
  try {
    console.log(`[ info ] Waiting for page response after login...`);
    
    const formDisappears = page.waitForFunction(() => {
      const emailInput = document.querySelector('input[type="email"]');
      return !emailInput || window.getComputedStyle(emailInput).display === 'none';
    }, { timeout: 20000 }).catch((e) => {
      console.log(`[ warn ] Form did not disappear: ${String(e).slice(0, 50)}`);
      return false;
    });

    await Promise.race([
      navigationPromise,
      page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
      formDisappears,
    ]);
    console.log(`[ info ] Sign-in processed`);
  } catch (e) {
    console.log(`[ warn ] Wait for response timeout: ${String(e).split('\n')[0]}`);
  }

  // Check current page
  const currentUrl = page.url();
  const currentPage = await bodyTextSnippet(page);
  console.log(`[ info ] After sign-in - URL: ${currentUrl}`);
  console.log(`[ info ] Page contains: ${currentPage.substring(0, 100)}...`);

  // CRITICAL FIX: Check if login form is still visible (login failed silently)
  await page.waitForTimeout(2000); // Give page time to process login
  const emailFieldStillVisible = await emailInput(page).isVisible().catch(() => false);
  if (emailFieldStillVisible && currentUrl.includes('/login')) {
    console.log(`[ warn ] ⚠️ CRITICAL: Login form still visible after click - login may have failed silently`);
    
    // Check for error message
    const errorMsg = await page.locator('[role="alert"], .error, .alert, [class*="error"], [class*="invalid"]')
      .first()
      .textContent()
      .catch(() => '');
    if (errorMsg) {
      console.error(`[ error ] Login error detected: ${errorMsg}`);
      return {
        ok: false,
        reason: `Login failed with error: ${errorMsg}`,
      };
    }

    // Try to recover by clearing form and retrying once
    if (!_retryAttempted) {
      console.log(`[ info ] Clearing form and retrying login...`);
      await emailField.clear();
      await passwordField.clear();
      await page.waitForTimeout(500);
      return ensureAuthenticated(page, email, password, true); // Retry recursively with flag
    } else {
      return {
        ok: false,
        reason: `Login failed. Form still visible even after retry. Credentials may be invalid or account may be locked.`,
      };
    }
  }

  // CRITICAL FIX: Verify we actually LEFT the login page
  await page.waitForTimeout(2000); // Extra wait for page transition
  let finalUrl = page.url();
  let attempts = 0;
  while (finalUrl.includes('/login') && attempts < 5) {
    console.log(`[ warn ] Still on login page (${finalUrl}), waiting for redirect...`);
    await page.waitForTimeout(2000);
    finalUrl = page.url();
    attempts++;
  }

  if (finalUrl.includes('/login')) {
    console.error(`[ error ] ❌ CRITICAL: Still stuck on /login page after multiple attempts`);
    return {
      ok: false,
      reason: `Failed to navigate away from login page after 5 attempts. URL: ${finalUrl}`,
    };
  }

  console.log(`[ info ] ✅ Successfully navigated away from login. New URL: ${finalUrl}`);

  // Now check if dashboard is ready
  const dashboardReached = await waitForDashboard(page, 30000);
  if (dashboardReached) {
    console.log(`[ info ] ✅ Dashboard reached successfully after login`);
    return { ok: true };
  }

  // If dashboard detection failed, try direct navigation to known paths
  console.log('[ info ] Dashboard not detected. Attempting direct navigation to dashboard paths...');
  const fallbackUrls = [
    'https://stations.epump.africa/stations',
    'https://stations.epump.africa/dashboard',
    'https://stations.epump.africa/home',
  ];
  
  for (const fallbackUrl of fallbackUrls) {
    try {
      // CRITICAL FIX: Check page state before navigation
      if (page.isClosed()) {
        console.error(`[ error ] ❌ Page closed during fallback navigation`);
        break;
      }

      console.log(`[ info ] Navigating to: ${fallbackUrl}`);
      await page.goto(fallbackUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => {
        console.log(`[ warn ] Navigation failed: ${String(e).split('\n')[0]}`);
      });
      
      // CRITICAL FIX: Check page state after navigation
      if (page.isClosed()) {
        console.error(`[ error ] ❌ Page closed after navigation`);
        break;
      }

      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      
      const dashboardNow = await waitForDashboard(page, 10000);
      if (dashboardNow && !page.url().includes('/login')) {
        console.log(`[ info ] ✅ Dashboard found at: ${page.url()}`);
        return { ok: true };
      }
    } catch (e) {
      if (page.isClosed()) {
        console.error(`[ error ] ❌ Page closed during fallback attempt`);
        break;
      }
      console.log(`[ warn ] Fallback attempt failed: ${String(e).split('\n')[0]}`);
    }
  }

  const finalText = await bodyTextSnippet(page);
  const finalCheckUrl = page.url();
  console.error(`[ error ] ❌ Authentication failed`);
  console.error(`[ error ] Final URL: ${finalCheckUrl}`);
  console.error(`[ error ] Page text: ${finalText}`);
  
  return {
    ok: false,
    reason: `Login failed. Final URL: ${finalCheckUrl}. Could not reach confirmed dashboard.`,
  };
}

export async function logout(page: Page): Promise<void> {
  console.log('[ info ] Attempting logout...');
  
  // CRITICAL FIX: Check page state before logout attempt
  if (page.isClosed()) {
    console.warn(`[ warn ] Page is closed, skipping logout`);
    return;
  }

  try {
    // Try multiple selector patterns for user icon
    const userIconSelectors = [
      '.pi-user',
      '.user-profile',
      '.user-name',
      '[class*="user"]',
      '[class*="profile"]',
      'button[aria-label*="user" i]',
    ];

    for (const selector of userIconSelectors) {
      if (page.isClosed()) break; // CRITICAL FIX: Check before each iteration

      const userIcon = page.locator(selector).first();
      if (await waitForVisible(userIcon, 2000)) {
        console.log(`[ info ] Found user icon via selector: ${selector}`);
        await userIcon.click();
        break;
      }
    }

    if (page.isClosed()) return; // CRITICAL FIX: Check after user icon attempt

    // Look for logout button
    const logoutBtn = page.getByText(/Logout|Log out/i).first();
    if (await waitForVisible(logoutBtn, 5000)) {
      console.log(`[ info ] Clicking logout button...`);
      await logoutBtn.click();
      
      if (page.isClosed()) return; // CRITICAL FIX: Check after logout click

      // Handle confirmation modal if any
      const confirmLogout = page.getByRole('button', { name: /Logout|Log out/i }).last();
      if (await waitForVisible(confirmLogout, 3000)) {
        console.log(`[ info ] Confirming logout...`);
        await confirmLogout.click();
      }
      
      try {
        await page.waitForURL('**/login', { timeout: 10000 }).catch(() => {});
        console.log(`[ info ] ✅ Logout successful`);
      } catch (e) {
        console.log(`[ warn ] URL change not detected after logout`);
      }
    }
  } catch (err) {
    if (page.isClosed()) {
      console.warn(`[ warn ] Page closed during logout attempt`);
    } else {
      console.warn(`[ warn ] Logout failed, using cookie clear fallback:`, err);
    }
  }

  // Always clear cookies as ultimate fallback if page still open
  if (!page.isClosed()) {
    try {
      await page.context().clearCookies();
      await page.context().clearPermissions();
    } catch (e) {
      console.warn(`[ warn ] Cookie clear failed:`, e);
    }
  }
}

export async function navigateToCompanyDashboard(page: Page, companyName: string): Promise<boolean> {
  console.log(`[ info ] Navigating to company dashboard: ${companyName}`);
  
  // CRITICAL FIX: Check page state before navigation
  if (page.isClosed()) {
    console.error(`[ error ] ❌ Page is closed, cannot navigate`);
    return false;
  }

  const searchBox = page.locator('input[placeholder*="Search"]').first();
  if (!(await waitForVisible(searchBox, 15000))) {
    console.error(`[ error ] ❌ Company search box not found.`);
    return false;
  }

  await searchBox.fill(companyName);
  await page.keyboard.press('Enter');
  
  const stationLink = page.locator(`tr:has-text("${companyName}") a[href*="/stations"]`).first();
  await stationLink.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
  if (!(await waitForVisible(stationLink, 15000))) {
    console.error(`[ error ] ❌ Station link for ${companyName} not found.`);
    return false;
  }

  console.log(`[ info ] Clicking station link for ${companyName}...`);
  
  // CRITICAL FIX: Check page before click
  if (page.isClosed()) {
    console.error(`[ error ] ❌ Page closed before clicking station link`);
    return false;
  }

  await stationLink.click();
  
  const success = await waitForDashboard(page, 30000);
  if (success) {
    console.log(`[ info ] ✅ Company dashboard loaded`);
  } else {
    console.error(`[ error ] ❌ Failed to load company dashboard`);
  }
  
  return success;
}

export async function openPortal(page: Page): Promise<'login' | 'dashboard' | 'unavailable'> {
  console.log(`[ info ] Opening ePump portal: ${EPUMP_URL}`);
  
  // CRITICAL FIX: Validate page is open
  if (page.isClosed()) {
    console.error(`[ error ] ❌ Page is closed, cannot open portal`);
    return 'unavailable';
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      // CRITICAL FIX: Add network validation before goto
      console.log(`[ info ] Attempt ${attempt}: Navigating to ${EPUMP_URL}`);
      await page.goto(EPUMP_URL, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
      console.log(`[ info ] Page loaded successfully (attempt ${attempt})`);
    } catch (navigationError: any) {
      const errorMsg = String(navigationError).split('\n')[0];
      console.warn(`[ warn ] Navigation error on attempt ${attempt}: ${errorMsg}`);
      
      // Check if page is still usable
      if (page.isClosed()) {
        console.error(`[ error ] ❌ Page closed during navigation`);
        return 'unavailable';
      }
      
      // Check for browser error page
      const browserErrorReason = await portalUnavailableReason(page);
      if (browserErrorReason) {
        console.error(`[ error ] ❌ Browser error detected: ${browserErrorReason}`);
        if (attempt === 2) {
          return 'unavailable';
        }
      }
    }

    // CRITICAL FIX: Verify page state before waiting for surface
    if (page.isClosed()) {
      console.error(`[ error ] ❌ Page closed before surface detection`);
      return 'unavailable';
    }

    const surface = await waitForSessionSurface(page, READY_TIMEOUT_MS);
    if (surface === 'login' || surface === 'dashboard') {
      console.log(`[ info ] Portal opened - surface: ${surface}`);
      return surface;
    }

    if (attempt < 2) {
      console.log(`[ info ] Retrying portal access (attempt ${attempt + 1}) after 2 second delay...`);
      try {
        await page.waitForTimeout(2000);
      } catch (e) {
        // If page closes during wait, stop retrying
        if (page.isClosed()) {
          return 'unavailable';
        }
      }
    }
  }

  console.error(`[ error ] ❌ Portal unavailable after 2 attempts`);
  return 'unavailable';
}

export async function waitForDashboard(page: Page, timeoutMs = DASHBOARD_TIMEOUT_MS): Promise<boolean> {
  return waitForPredicate(async () => isDashboardReady(page), timeoutMs);
}

export async function waitForVisible(locator: Locator, timeoutMs = 60_000): Promise<boolean> {
  try {
    await locator.waitFor({ state: 'visible', timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
}

export async function openPriceLogPage(page: Page): Promise<boolean> {
  console.log(`[ info ] Opening Price Log page...`);
  
  // Try navigation helper first
  const navSuccess = await openNestedNavigation(page, /Price Log/i);
  if (!navSuccess) {
    console.warn(`[ warn ] Navigation helper failed, trying direct approach...`);
  }

  // Check if we reached the page via URL or button visibility
  const urlMatches = page.url().toLowerCase().includes('log') || page.url().toLowerCase().includes('price');
  const updateBtnVisible = await page.getByRole('button', { name: /Update Price/i }).first().isVisible().catch(() => false);
  
  if (urlMatches || updateBtnVisible) {
    console.log(`[ info ] ✅ Price Log page confirmed`);
    return true;
  }

  // Fallback: Try direct URL navigation
  console.log(`[ info ] Trying direct URL to price log...`);
  try {
    await page.goto('https://stations.epump.africa/price-log', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    
    const btnVisible = await page.getByRole('button', { name: /Update Price/i }).first().isVisible().catch(() => false);
    if (btnVisible) {
      console.log(`[ info ] ✅ Price Log reached via direct URL`);
      return true;
    }
  } catch (e) {
    console.log(`[ warn ] Direct URL failed: ${String(e).slice(0, 50)}`);
  }

  // Last resort: wait for button with extended timeout
  console.log(`[ info ] Waiting for Update Price button as final check...`);
  return waitForPredicate(
    async () => {
      const btn = page.getByRole('button', { name: /Update Price/i }).first();
      return btn.isVisible().catch(() => false);
    },
    30_000,
  );
}

export async function openPriceApprovalPage(page: Page): Promise<boolean> {
  console.log(`[ info ] Opening Price Approval page...`);
  
  // Try navigation helper first
  const navSuccess = await openNestedNavigation(page, /Price approval/i);
  if (!navSuccess) {
    console.warn(`[ warn ] Navigation helper failed, trying direct approach...`);
  }

  // Check if we reached the page
  const urlMatches = page.url().toLowerCase().includes('approval');
  const approveBtnVisible = await page.getByRole('button', { name: /Approve/i }).first().isVisible().catch(() => false);
  
  if (urlMatches || approveBtnVisible) {
    console.log(`[ info ] ✅ Price Approval page confirmed`);
    return true;
  }

  // Fallback: Try direct URL navigation
  console.log(`[ info ] Trying direct URL to price approval...`);
  try {
    await page.goto('https://stations.epump.africa/price-approval', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
    
    const btnVisible = await page.getByRole('button', { name: /Approve/i }).first().isVisible().catch(() => false);
    if (btnVisible) {
      console.log(`[ info ] ✅ Price Approval reached via direct URL`);
      return true;
    }
  } catch (e) {
    console.log(`[ warn ] Direct URL failed: ${String(e).slice(0, 50)}`);
  }

  // Last resort: wait for button with timeout
  console.log(`[ info ] Waiting for Approve button as final check...`);
  return waitForPredicate(
    async () => {
      const btn = page.getByRole('button', { name: /Approve/i }).first();
      return btn.isVisible().catch(() => false);
    },
    30_000,
  );
}

async function openNestedNavigation(page: Page, linkName: RegExp): Promise<boolean> {
  console.log(`[ info ] Opening nested navigation for: ${linkName}`);
  
  // Try direct URL navigation based on link name
  const linkNameStr = linkName.source.toLowerCase().replace(/\\/g, '').replace(/^|$/g, '');
  const urlMap: { [key: string]: string } = {
    'price log': '/price-log',
    'price approval': '/price-approval',
  };
  
  // First, try to click the menu if visible
  const menu = priceManagementLink(page);
  const menuVisible = await waitForVisible(menu, 5_000);
  
  if (menuVisible) {
    console.log(`[ info ] Price Management menu found, clicking...`);
    await menu.click();
    await page.waitForTimeout(1000); // Wait for menu to expand
  }

  // Try to find the link with various strategies
  const linkStrategies = [
    () => page.getByRole('link', { name: linkName }).first(),
    () => page.getByRole('link', { name: new RegExp(linkName.source, 'i') }).first(),
    () => page.locator(`a:has-text("${linkNameStr}")`).first(),
    () => page.locator(`[role="link"]:has-text("${linkNameStr}")`).first(),
  ];

  for (let i = 0; i < linkStrategies.length; i++) {
    const targetLink = linkStrategies[i]();
    const isVisible = await waitForVisible(targetLink, 5_000);
    
    if (isVisible) {
      console.log(`[ info ] ✅ Found navigation link via strategy ${i + 1}`);
      await targetLink.click();
      await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
      return true;
    }
  }

  // If direct link not found, try URL-based navigation
  const targetUrl = urlMap[linkNameStr];
  if (targetUrl) {
    console.log(`[ info ] Link not found, attempting direct URL navigation: ${targetUrl}`);
    const baseUrl = 'https://stations.epump.africa';
    try {
      await page.goto(baseUrl + targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
      const currentUrl = page.url();
      if (currentUrl.includes(targetUrl) || currentUrl.includes(linkNameStr.replace(/-/g, ''))) {
        console.log(`[ info ] ✅ Successfully navigated via URL`);
        return true;
      }
    } catch (e) {
      console.log(`[ warn ] URL-based navigation failed: ${String(e).slice(0, 50)}`);
    }
  }

  console.error(`[ error ] ❌ Could not open navigation for: ${linkName}`);
  return false;
}

async function waitForSessionSurface(
  page: Page,
  timeoutMs: number,
): Promise<'login' | 'dashboard' | 'unavailable' | null> {
  const deadline = Date.now() + timeoutMs;
  const startTime = Date.now();
  console.log(`[ info ] Waiting for session surface (${timeoutMs/1000}s timeout)...`);

  while (Date.now() < deadline) {
    // CRITICAL FIX: Check if page is closed before proceeding
    if (page.isClosed()) {
      console.error(`[ error ] ❌ Page is closed, cannot wait for session surface`);
      return 'unavailable';
    }

    const url = page.url();
    const elapsed = Date.now() - startTime;
    
    if (await isDashboardReady(page)) {
      console.log(`[ info ] ✅ Dashboard surface detected at ${url} (${elapsed}ms)`);
      return 'dashboard';
    }

    if (await emailInput(page).isVisible().catch(() => false)) {
      console.log(`[ info ] ✅ Login surface detected at ${url} (${elapsed}ms)`);
      return 'login';
    }

    const unavailableReason = await portalUnavailableReason(page);
    if (unavailableReason) {
      console.error(`[ error ] ❌ ${unavailableReason}`);
      return 'unavailable';
    }

    // Check for landing page redirect and handle it
    if (url.includes('epump.com.ng') || url.includes('epump.africa') && !url.includes('/login') && !url.includes('dashboard')) {
      console.log(`[ info ] Detected redirect/landing page at ${url}`);
      const loginBtn = page.getByRole('button', { name: /Login/i }).first();
      if (await waitForVisible(loginBtn, 2000)) {
        console.log(`[ info ] Clicking login button on redirect page...`);
        await loginBtn.click().catch(() => {});
      }
    }

    // CRITICAL FIX: Wrap page.waitForTimeout in try-catch to handle page closure
    try {
      await page.waitForTimeout(POLL_INTERVAL_MS);
    } catch (error: any) {
      if (error.message?.includes('closed') || error.message?.includes('Target page')) {
        console.error(`[ error ] ❌ Page closed during polling: ${error.message}`);
        return 'unavailable';
      }
      console.warn(`[ warn ] Polling error (continuing): ${String(error).split('\n')[0]}`);
    }
  }

  console.error(`[ error ] ❌ Timeout waiting for session surface (${timeoutMs/1000}s) at ${page.url()}`);
  return null;
}

async function isDashboardReady(page: Page): Promise<boolean> {
  try {
    const url = page.url().toLowerCase();
    const title = await page.title().catch(() => '');

    // Definitely not dashboard if on login page
    const loginSurfaceVisible = await emailInput(page).isVisible().catch(() => false);
    if (loginSurfaceVisible || url.includes('/login')) {
      return false;
    }

    // Strong indicators we're on dashboard
    if (url.includes('dashboard') || url.includes('/stations') || url.includes('/main')) {
      return true;
    }

    // Check for page title
    if (title.toLowerCase().includes('dashboard') || title.toLowerCase().includes('station') || title.toLowerCase().includes('epump')) {
      return true;
    }

    // Check for dashboard elements
    const hasSearchBox = await page.locator('input[placeholder*="Search"]').first().isVisible().catch(() => false);
    const hasPriceLink = await priceManagementLink(page).isVisible().catch(() => false);
    const hasDashboardHeading = await dashboardHeading(page).isVisible().catch(() => false);
    const hasNavigation = await page.locator('nav, [role="navigation"], aside, .navbar, .sidebar, .menu').first().isVisible().catch(() => false);

    if (hasSearchBox || hasPriceLink || hasDashboardHeading || hasNavigation) {
      return true;
    }

    // Check for main content area
    const hasMainContent = await page.locator('main, [role="main"], .dashboard, .container, .content').first().isVisible().catch(() => false);
    if (hasMainContent) {
      return true;
    }

    // Check for body content that's not login
    const bodyContent = await page.locator('body').evaluate((el) => el.textContent || '');
    const hasLoginKeywords = /sign.?in|login|password|email|username/i.test(bodyContent);
    const hasContent = bodyContent.length > 500;
    
    if (hasContent && !hasLoginKeywords) {
      return true;
    }

    return false;
  } catch (e) {
    console.log('[ info ] Dashboard readiness check error:', e);
    return false;
  }
}

async function bodyTextSnippet(page: Page): Promise<string> {
  const text = await page.locator('body').innerText().catch(() => '');
  return text.replace(/\s+/g, ' ').trim().slice(0, 240);
}

export async function portalUnavailableReason(page: Page): Promise<string | null> {
  const url = page.url();
  const title = await page.title().catch(() => '');
  const bodySnippet = await bodyTextSnippet(page);
  const pageSnapshot = `${title} ${bodySnippet}`.trim();

  if (url.startsWith('chrome-error://') || BROWSER_ERROR_PATTERNS.some((pattern) => pattern.test(pageSnapshot))) {
    return bodySnippet
      ? `The browser showed a network error page instead of the ePump app. URL: ${url}. Visible page text: ${bodySnippet}`
      : `The browser showed a network error page instead of the ePump app. URL: ${url}.`;
  }

  return null;
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

function shouldTrackResponse(response: Response): boolean {
  const url = response.url();
  if (!url.startsWith(EPUMP_ORIGIN)) {
    return false;
  }

  const request = response.request();
  if (!TRACKED_RESOURCE_TYPES.has(request.resourceType())) {
    return false;
  }

  if (IGNORED_HTTP_METHODS.has(request.method().toUpperCase())) {
    return false;
  }

  return true;
}

function formatStatusAuditFailures(failures: StatusAuditFailure[]): string {
  if (failures.length === 0) {
    return 'none';
  }

  return failures
    .map((failure) => `- ${failure.status} ${failure.method} ${failure.resourceType} ${failure.url}`)
    .join('\n');
}

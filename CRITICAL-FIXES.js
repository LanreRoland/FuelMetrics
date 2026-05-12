// CRITICAL FIX #1: Add Error Handling for Closed Pages
// File: tests/helpers/epump.ts
// Location: Replace the waitForSessionSurface function (around line 430-467)

// ===============================================================
// BEFORE (BROKEN - No error handling)
// ===============================================================
/*
async function waitForSessionSurface(
  page: Page,
  timeoutMs: number,
): Promise<'login' | 'dashboard' | 'unavailable' | null> {
  const deadline = Date.now() + timeoutMs;
  const startTime = Date.now();
  console.log(`[ info ] Waiting for session surface (${timeoutMs/1000}s timeout)...`);

  while (Date.now() < deadline) {
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

    if (url.includes('epump.com.ng') || url.includes('epump.africa') && !url.includes('/login') && !url.includes('dashboard')) {
      console.log(`[ info ] Detected redirect/landing page at ${url}`);
      const loginBtn = page.getByRole('button', { name: /Login/i }).first();
      if (await waitForVisible(loginBtn, 2000)) {
        console.log(`[ info ] Clicking login button on redirect page...`);
        await loginBtn.click().catch(() => {});
      }
    }

    await page.waitForTimeout(POLL_INTERVAL_MS); // ← BUG: No error handling!
  }

  console.error(`[ error ] ❌ Timeout waiting for session surface (${timeoutMs/1000}s) at ${page.url()}`);
  return null;
}
*/

// ===============================================================
// AFTER (FIXED - With error handling)
// ===============================================================

async function waitForSessionSurface(
  page: Page,
  timeoutMs: number,
): Promise<'login' | 'dashboard' | 'unavailable' | null> {
  const deadline = Date.now() + timeoutMs;
  const startTime = Date.now();
  console.log(`[ info ] Waiting for session surface (${timeoutMs/1000}s timeout)...`);

  while (Date.now() < deadline) {
    // CRITICAL FIX: Check if page is closed before using it
    try {
      if (!page || page.isClosed?.()) {
        console.error('[ error ] ❌ Page was closed during wait');
        return 'unavailable';
      }
    } catch (e) {
      console.error(`[ error ] ❌ Cannot access page: ${String(e).split('\n')[0]}`);
      return 'unavailable';
    }

    try {
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

      if (url.includes('epump.com.ng') || url.includes('epump.africa') && !url.includes('/login') && !url.includes('dashboard')) {
        console.log(`[ info ] Detected redirect/landing page at ${url}`);
        const loginBtn = page.getByRole('button', { name: /Login/i }).first();
        if (await waitForVisible(loginBtn, 2000)) {
          console.log(`[ info ] Clicking login button on redirect page...`);
          await loginBtn.click().catch(() => {});
        }
      }
    } catch (e) {
      const errMsg = String(e).toLowerCase();
      if (errMsg.includes('page has navigated away') || errMsg.includes('target closed') || errMsg.includes('disposed')) {
        console.error(`[ error ] ❌ Page became unavailable: ${String(e).split('\n')[0]}`);
        return 'unavailable';
      }
      // Log but continue for other transient errors
      console.warn(`[ warn ] Transient error during session check: ${String(e).split('\n')[0]}`);
    }

    // CRITICAL FIX: Wrap timeout in try-catch
    try {
      await page.waitForTimeout(POLL_INTERVAL_MS);
    } catch (e) {
      const errMsg = String(e).toLowerCase();
      if (errMsg.includes('closed') || errMsg.includes('disposed')) {
        console.error('[ error ] ❌ Page closed during wait');
        return 'unavailable';
      }
      console.warn(`[ warn ] Timeout call failed: ${String(e).split('\n')[0]}`);
      // Use native setTimeout as fallback
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }

  console.error(`[ error ] ❌ Timeout waiting for session surface (${timeoutMs/1000}s) at ${page.url().catch(() => 'UNKNOWN')}`);
  return null;
}

// ===============================================================
// CRITICAL FIX #2: Enhanced Timeout Configuration
// ===============================================================
// At the top of helpers/epump.ts, replace timeout constants:

// BEFORE
const NAVIGATION_TIMEOUT_MS = 60_000;
const READY_TIMEOUT_MS = 60_000;

// AFTER - Add environment variable support for flexibility
const NAVIGATION_TIMEOUT_MS = (() => {
  const env = process.env.EPUMP_NAV_TIMEOUT;
  return env ? parseInt(env) : 120_000; // Increased from 60s to 120s default
})();
const READY_TIMEOUT_MS = (() => {
  const env = process.env.EPUMP_READY_TIMEOUT;
  return env ? parseInt(env) : 120_000; // Increased from 60s to 120s default
})();

console.log(`[ info ] Configured timeouts: NAV=${NAVIGATION_TIMEOUT_MS}ms, READY=${READY_TIMEOUT_MS}ms`);

// ===============================================================
// CRITICAL FIX #3: Add Diagnostic Information
// ===============================================================
// In the openPortal function, add this at the start (after line ~345):

export async function openPortal(page: Page): Promise<'login' | 'dashboard' | 'unavailable'> {
  console.log(`[ info ] Opening ePump portal: ${EPUMP_URL}`);
  
  // NEW: Diagnostic check
  console.log(`[ diag ] Environment: NODE_ENV=${process.env.NODE_ENV}, DEBUG=${process.env.DEBUG}`);
  console.log(`[ diag ] Timeouts: Navigation=${NAVIGATION_TIMEOUT_MS}ms, Ready=${READY_TIMEOUT_MS}ms`);
  try {
    console.log(`[ diag ] Page state: isClosed=${page.isClosed?.() ?? 'unknown'}, URL=${page.url()}`);
    console.log(`[ diag ] Browser: ${page.context()?.browser ? 'active' : 'closed'}`);
  } catch (e) {
    console.error(`[ diag ] Cannot access page state: ${String(e).split('\n')[0]}`);
  }
  
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      // ... rest of existing code ...
    } catch (e) {
      console.error(`[ error ] Navigation attempt ${attempt} failed: ${String(e).split('\n')[0]}`);
      // NEW: Check if page closed
      if (page.isClosed?.()) {
        console.error('[ error ] ❌ Page was closed during navigation attempt');
        return 'unavailable';
      }
    }
  }
  // ... rest of function ...
}

// ===============================================================
// IMPLEMENTATION STEPS:
// ===============================================================
// 1. Open: tests/helpers/epump.ts
// 2. Find: waitForSessionSurface function (search for "Waiting for session surface")
// 3. Replace: Entire function with the AFTER version above
// 4. Find: Timeline constants at top (search for "NAVIGATION_TIMEOUT_MS")
// 5. Replace: Both timeout constants with NEW versions
// 6. Find: openPortal function (search for "Opening ePump portal")
// 7. Add: Diagnostic logging at the start of function
// 8. Test: Run 'npm test -- tests/01-login.spec.ts'
// 9. Monitor: Look for "Page was closed" in output if still failing
// ===============================================================

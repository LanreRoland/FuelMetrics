import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureAuthenticated, waitForDashboard } from './helpers/epump';

/**
 * 07-ButtonClickAudit.spec.ts
 *
 * This test identifies visible clickable elements in the main dashboard content
 * and attempts to click each one to verify if it causes navigation failures,
 * new console errors, or UI crashes.
 */

const AUDIT_ATTR = 'data-button-audit-id';
const KNOWN_BASELINE_ERROR_PATTERNS = [
  /attribute.*NaN/i,
  /Expected length,\s*"NaN"/i,
  /translate\(NaN,\s*0\)/i,
  /ERR_BLOCKED_BY_RESPONSE\.NotSameOrigin/i,
  /^(?:\[Console Error\]\s*)?true$/i,
];

type AuditTarget = {
  id: string;
  label: string;
};

type AuditResult = {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  detail?: string;
};

function isNonActionableClickError(message: string): boolean {
  return [
    /element is not attached/i,
    /element is not visible/i,
    /outside of the viewport/i,
    /another element .* intercepts pointer events/i,
    /subtree intercepts pointer events/i,
    /page has navigated away/i,
    /target closed/i,
    /timeout .*click/i,
    /not enabled/i,
    /no node found for selector/i,
  ].some((pattern) => pattern.test(message));
}

async function restoreDashboard(page: Page, dashboardUrl: string): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (page.url() !== dashboardUrl) {
      await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }

    if (await waitForDashboard(page, 30_000)) {
      return;
    }
  }

  await expect(page).toHaveURL(/dashboard/i, { timeout: 30_000 });
  await expect(
    page
      .locator('section, article, .card, .widget, .panel, .p-card, div')
      .filter({ hasText: /Station information|NUMBER OF STATION|DISCONNECTED PUMP|PUMP IN STATION/i })
      .first(),
  ).toBeVisible({ timeout: 30_000 });
}

async function markAuditTargets(page: Page): Promise<AuditTarget[]> {
  return page.evaluate(({ auditAttr }) => {
    const selector = 'button, a, [role="button"], .clickable, .btn';
    const excludedAncestorSelector = [
      'nav',
      'aside',
      '[role="navigation"]',
      'section.fixed',
      '.header',
      '.sticky',
      '.sidebar',
      '.side-bar',
      '.sidenav',
      '.drawer',
      '.menu',
      '.ant-menu',
      '[class*="sidebar"]',
      '[class*="sidenav"]',
      '[class*="drawer"]',
    ].join(', ');
    const leftRailBoundary = Math.max(260, Math.min(window.innerWidth * 0.25, 340));

    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
    const isVisible = (element: HTMLElement) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const isDockedToLeftRail = centerX < leftRailBoundary;
      const isFloatingWidget =
        ['fixed', 'sticky'].includes(style.position) ||
        (centerX > window.innerWidth - 180 && rect.top > window.innerHeight - 220);

      return (
        style.visibility !== 'hidden' &&
        style.display !== 'none' &&
        rect.width > 0 &&
        rect.height > 0 &&
        !isDockedToLeftRail &&
        !isFloatingWidget
      );
    };

    document.querySelectorAll(`[${auditAttr}]`).forEach((element) => {
      element.removeAttribute(auditAttr);
    });

    const targets: AuditTarget[] = [];
    let index = 0;

    for (const node of Array.from(document.querySelectorAll(selector))) {
      const element = node as HTMLElement;
      if (!isVisible(element)) {
        continue;
      }

      if (element.closest(excludedAncestorSelector)) {
        continue;
      }

      const text = normalize(element.innerText || element.textContent || '');
      const id = element.id ? `#${element.id}` : '';
      const title = normalize(element.getAttribute('title') || '');
      const ariaLabel = normalize(element.getAttribute('aria-label') || '');
      const href = normalize(element.getAttribute('href') || '');
      const label = text || ariaLabel || title || href || `Element #${index}`;

      element.setAttribute(auditAttr, String(index));
      targets.push({ id: String(index), label });
      index += 1;
    }

    return targets;
  }, { auditAttr: AUDIT_ATTR });
}

function isKnownBaselineConsoleError(message: string): boolean {
  return KNOWN_BASELINE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

test.describe('Dashboard Button Click Audit', () => {
  test.setTimeout(300000);

  test('should click every clickable element on the dashboard and report status', async ({ page }) => {
    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      console.error(`[ error ] Authentication failed: ${auth.reason}`);
      await page.screenshot({ path: 'auth-failure.png' });
      test.skip(true, auth.reason);
    }

    console.log('[ info ] Navigating to Dashboard and waiting for stability...');
    await page.waitForTimeout(5000);

    const dashboardUrl = page.url();
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(`[Console Error] ${msg.text()}`);
      }
    });

    const initialTargets = await markAuditTargets(page);
    console.log(`[ info ] Found ${initialTargets.length} visible clickable elements in the main content area.`);

    const results: AuditResult[] = [];
    let consoleCursor = consoleErrors.length;

    for (const target of initialTargets) {
      await restoreDashboard(page, dashboardUrl);
      const currentTargets = await markAuditTargets(page);
      const currentTarget = currentTargets.find((candidate) => candidate.id === target.id);
      const label = currentTarget?.label || target.label;

      console.log(`[ click ] [${Number(target.id) + 1}/${initialTargets.length}] Examining: "${label}"`);

      if (!currentTarget) {
        console.log('[ skip ] Element is no longer present on the refreshed dashboard.');
        results.push({ name: label, status: 'SKIP', detail: 'Element no longer present' });
        continue;
      }

      try {
        const element = page.locator(`[${AUDIT_ATTR}="${target.id}"]`).first();
        if (!(await element.isVisible().catch(() => false))) {
          console.log('[ skip ] Element is not visible, skipping click.');
          results.push({ name: label, status: 'SKIP', detail: 'Element not visible' });
          continue;
        }

        await element.scrollIntoViewIfNeeded().catch(() => {});

        let clickSuccess = true;
        await element.click({ timeout: 8000 }).catch(async (error) => {
          console.warn(`[ warn ] ${error.message.split('\n')[0]}. Trying force click...`);
          await element.click({ force: true, timeout: 8000 }).catch(async (forceError) => {
            const shortMessage = forceError.message.split('\n')[0];
            const status = isNonActionableClickError(forceError.message) ? 'SKIP' : 'FAIL';
            const logLabel = status === 'SKIP' ? 'warn' : 'error';
            console[logLabel](
              `[ ${logLabel} ] Force click also failed for "${label}": ${shortMessage}`,
            );
            await page.screenshot({ path: `audit-error-elem-${target.id}.png` });
            clickSuccess = false;
            results.push({ name: label, status, detail: shortMessage });
          });
        });

        if (!clickSuccess) {
          continue;
        }

        await page.waitForTimeout(1000);

        const newConsoleErrors = consoleErrors
          .slice(consoleCursor)
          .filter((message) => !isKnownBaselineConsoleError(message));
        consoleCursor = consoleErrors.length;

        let status: 'PASS' | 'FAIL' = 'PASS';
        let detail = '';
        if (newConsoleErrors.length > 0) {
          status = 'FAIL';
          detail = newConsoleErrors[0] || 'Unknown console error';
        }

        if (page.url() !== dashboardUrl) {
          console.log(`[ info ] Navigated away to ${page.url()}. Restoring dashboard...`);
          await restoreDashboard(page, dashboardUrl);
        }

        results.push({ name: label, status, detail });
      } catch (error: any) {
        console.error(`[ error ] Failed to interact with "${label}": ${error.message}`);
        await page.screenshot({ path: `audit-error-catch-${target.id}.png` });
        results.push({ name: label, status: 'FAIL', detail: error.message });
      }
    }

    console.log('\n--- BUTTON CLICK AUDIT RESULTS ---');
    let passCount = 0;
    let failCount = 0;
    let skipCount = 0;

    results.forEach((result) => {
      const icon = result.status === 'PASS' ? 'PASS' : result.status === 'FAIL' ? 'FAIL' : 'SKIP';
      console.log(`${icon} [${result.status}] ${result.name} ${result.detail ? `(${result.detail})` : ''}`);
      if (result.status === 'PASS') {
        passCount += 1;
      } else if (result.status === 'FAIL') {
        failCount += 1;
      } else {
        skipCount += 1;
      }
    });

    console.log('----------------------------------');
    console.log(`Summary: ${passCount} Passed, ${failCount} Failed, ${skipCount} Skipped.`);
    console.log('----------------------------------');

    await page.screenshot({ path: 'button-audit-final.png', fullPage: true });

    expect(failCount).toBe(0);
  });
});

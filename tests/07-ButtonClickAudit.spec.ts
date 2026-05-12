import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
} from './helpers/epump';
import { ButtonAuditPage, type AuditResult } from './pages/ButtonAuditPage';

test.describe('Dashboard Button Click Audit', () => {
  test.setTimeout(300000);

  test('should click every clickable element on the dashboard and report status', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const auditPage = new ButtonAuditPage(page);

    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      await page.screenshot({ path: 'auth-failure.png' });
      statusAudit.stop();
      test.skip(true, auth.reason);
    }

    await page.waitForTimeout(5000);
    const dashboardUrl = page.url();

    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(`[Console Error] ${msg.text()}`);
    });

    const initialTargets = await auditPage.markAuditTargets();
    console.log(`[ info ] Found ${initialTargets.length} visible clickable elements.`);

    const results: AuditResult[] = [];
    let consoleCursor = consoleErrors.length;

    for (const target of initialTargets) {
      await auditPage.restoreDashboard(dashboardUrl);
      const currentTargets = await auditPage.markAuditTargets();
      const currentTarget = currentTargets.find((c) => c.id === target.id);
      const label = currentTarget?.label || target.label;

      console.log(`[ click ] [${Number(target.id) + 1}/${initialTargets.length}] Examining: "${label}"`);

      if (!currentTarget) {
        console.log('[ skip ] Element no longer present.');
        results.push({ name: label, status: 'SKIP', detail: 'Element no longer present' });
        continue;
      }

      try {
        const element = auditPage.auditElement(target.id);

        if (!(await element.isVisible().catch(() => false))) {
          results.push({ name: label, status: 'SKIP', detail: 'Element not visible' });
          continue;
        }

        await element.scrollIntoViewIfNeeded().catch(() => {});

        let clickSuccess = true;
        await element.click({ timeout: 8000 }).catch(async (err) => {
          console.warn(`[ warn ] ${err.message.split('\n')[0]}. Trying force click...`);
          await element.click({ force: true, timeout: 8000 }).catch(async (forceErr) => {
            const msg = forceErr.message.split('\n')[0];
            const status = auditPage.isNonActionableClickError(forceErr.message) ? 'SKIP' : 'FAIL';
            console[status === 'SKIP' ? 'warn' : 'error'](`[ ${status.toLowerCase()} ] Force click failed for "${label}": ${msg}`);
            await page.screenshot({ path: `audit-error-elem-${target.id}.png` });
            clickSuccess = false;
            results.push({ name: label, status, detail: msg });
          });
        });

        if (!clickSuccess) continue;

        await page.waitForTimeout(1000);

        const newErrors = consoleErrors.slice(consoleCursor).filter(
          (msg) => !auditPage.isKnownBaselineConsoleError(msg),
        );
        consoleCursor = consoleErrors.length;

        const status: 'PASS' | 'FAIL' = newErrors.length > 0 ? 'FAIL' : 'PASS';
        const detail = newErrors[0] || '';

        if (page.url() !== dashboardUrl) {
          await auditPage.restoreDashboard(dashboardUrl);
        }

        results.push({ name: label, status, detail });
      } catch (error: any) {
        console.error(`[ error ] Failed to interact with "${label}": ${error.message}`);
        await page.screenshot({ path: `audit-error-catch-${target.id}.png` });
        results.push({ name: label, status: 'FAIL', detail: error.message });
      }
    }

    console.log('\n--- BUTTON CLICK AUDIT RESULTS ---');
    let pass = 0, fail = 0, skip = 0;
    results.forEach((r) => {
      console.log(`[${r.status}] ${r.name}${r.detail ? ` (${r.detail})` : ''}`);
      if (r.status === 'PASS') pass++;
      else if (r.status === 'FAIL') fail++;
      else skip++;
    });
    console.log(`Summary: ${pass} Passed, ${fail} Failed, ${skip} Skipped.`);

    await page.screenshot({ path: 'button-audit-final.png', fullPage: true });
    expect(fail).toBe(0);
    await assertStatusCodeAudit(page, statusAudit, '07-ButtonClickAudit.spec.ts');
  });
});
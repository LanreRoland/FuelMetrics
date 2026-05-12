import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
} from './helpers/epump';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Dashboard Functionality Audit', () => {
  test.setTimeout(210000);

  test('should audit dashboard widgets and non-functional elements', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const dashboard = new DashboardPage(page);

    // Capture console errors before auth so we catch early load errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, auth.reason);
    }

    // Allow complex widgets time to render
    await page.waitForTimeout(10000);
    await dashboard.takeFullPageScreenshot('dashboard-audit-full.png');

    // Gather audit findings
    const findings: string[] = [];

    if (consoleErrors.length > 0) {
      const unique = [...new Set(consoleErrors)];
      findings.push(`Console errors detected: ${unique.slice(0, 5).join('; ')}`);
      if (unique.some(e => e.includes('NaN'))) {
        findings.push('CRITICAL: NaN rendering errors found (likely broken charts/SVGs).');
      }
    }

    const containers = page.locator('.card, .widget, .panel, .p-card');
    const containerCount = await containers.count();
    for (let i = 0; i < containerCount; i++) {
      const text = await containers.nth(i).innerText();
      if (text.trim().length < 5) {
        findings.push(`Widget at index ${i} appears empty or failed to load.`);
      }
    }

    const brokenImages = await dashboard.getBrokenImages();
    if (brokenImages.length > 0) {
      findings.push(`Found ${brokenImages.length} broken images.`);
    }

    const errorNodes = await dashboard.getErrorTextNodes();
    if (errorNodes.length > 0) {
      findings.push(`Found ${errorNodes.length} error strings in UI: ${errorNodes.slice(0, 3).join(', ')}`);
    }

    console.log('--- DASHBOARD AUDIT RESULTS ---');
    findings.forEach(f => console.log(`[ find ] ${f}`));
    if (findings.length === 0) console.log('[ info ] No obvious breakages found.');
    console.log('-------------------------------');

    await expect(dashboard.priceManagementLink).toBeVisible();
    await assertStatusCodeAudit(page, statusAudit, '06-DashboardAudit.spec.ts');
  });
});

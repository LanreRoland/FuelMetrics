import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
} from './helpers/epump';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Dashboard Availability Validation', () => {
  test.setTimeout(120000);

  test('should load the dashboard shell and core widgets', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const dashboard = new DashboardPage(page);

    const nanConsoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        const text = msg.text();
        if (text.includes('NaN') && (text.includes('attribute') || text.includes('Expected'))) {
          nanConsoleErrors.push(text);
        }
      }
    });

    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, `Authentication failed: ${auth.reason}`);
    }

    await page.waitForTimeout(10000);

    await expect(page).toHaveURL(/dashboard/i, { timeout: 30000 });
    await expect(dashboard.dashboardLink).toBeVisible({ timeout: 30000 });
    await expect(dashboard.priceManagementLink).toBeVisible({ timeout: 30000 });
    await expect(dashboard.stationInfoWidget).toBeVisible({ timeout: 30000 });
    await expect(dashboard.stationInfoText).toBeVisible({ timeout: 30000 });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).toMatch(/Dashboard/i);
    expect(bodyText).toMatch(/Station information|NUMBER OF STATION|DISCONNECTED PUMP|PUMP IN STATION/i);

    if (nanConsoleErrors.length > 0) {
      console.warn(`[ warn ] Ignoring ${nanConsoleErrors.length} NaN-related console messages.`);
    }

    await assertStatusCodeAudit(page, statusAudit, '08-DashboardDataValidation.spec.ts');
  });
});

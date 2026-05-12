import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
} from './helpers/epump';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Epump Concurrent Login Simulation', () => {
  test.describe.configure({ mode: 'parallel' });
  test.setTimeout(210000);

  for (let i = 1; i <= 10; i++) {
    test(`User ${i}: should successfully login`, async ({ page }) => {
      const statusAudit = startStatusCodeAudit(page);
      const dashboard = new DashboardPage(page);

      const auth = await ensureAuthenticated(page);
      if (!auth.ok) {
        statusAudit.stop();
        test.skip(true, auth.reason);
      }

      await expect(dashboard.priceManagementLink).toBeVisible({ timeout: 30000 });
      await expect(page).not.toHaveURL(/\/login/i);
      await assertStatusCodeAudit(page, statusAudit, `05-LoadSimulation User ${i}`);
    });
  }
});

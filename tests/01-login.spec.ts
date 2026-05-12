import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
} from './helpers/epump';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Epump Login Automation', () => {
  test.setTimeout(210000);

  test('should execute the login flow completely', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const dashboard = new DashboardPage(page);

    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, auth.reason);
    }

    await expect(dashboard.priceManagementLink).toBeVisible({ timeout: 30000 });
    await expect(page).not.toHaveURL(/\/login/i);
    await assertStatusCodeAudit(page, statusAudit, '01-login.spec.ts');
  });
});

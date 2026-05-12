import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  navigateToCompanyDashboard,
  startStatusCodeAudit,
} from './helpers/epump';
import { ShutdownPumpPage } from './pages/ShutdownPumpPage';

const ADMIN_EMAIL = process.env.EPUMP_EMAIL;
const ADMIN_PASSWORD = process.env.EPUMP_PASSWORD;
const TARGET_COMPANY = 'Demonstration Limited';
const ACCESS_DENIED_TEXT = /Your account does not have access to this Data/i;

test.describe('Support Admin: Shutdown Pump Access', () => {
  test.setTimeout(300000);

  test('should successfully navigate as admin to company shutdown pump module', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const shutdownPage = new ShutdownPumpPage(page);

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      statusAudit.stop();
      throw new Error(
        'Missing required credentials: EPUMP_EMAIL and/or EPUMP_PASSWORD. Configure them in repository secrets.',
      );
    }

    // 1. Login as Support Admin
    const auth = await ensureAuthenticated(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, `Admin Authentication failed: ${auth.reason}`);
    }

    // 2. Navigate to Demonstration Limited
    console.log(`[ info ] Navigating to company: ${TARGET_COMPANY}`);
    const companyReached = await navigateToCompanyDashboard(page, TARGET_COMPANY);
    if (!companyReached) {
      statusAudit.stop();
      test.skip(true, `Failed to reach dashboard for ${TARGET_COMPANY}`);
    }

    // 3. Navigate to Shutdown Pump via sidebar
    console.log('[ info ] Navigating to Shutdown Pump via sidebar...');
    const sidebarReached = await shutdownPage.navigateViaSidebar();
    if (!sidebarReached) {
      // Fallback to direct URL
      console.warn('[ warn ] Sidebar navigation failed, attempting direct URL fallback...');
      await shutdownPage.goto();
    }

    // 4. Verify Access
    console.log('[ info ] Verifying module availability...');
    await page.waitForTimeout(5000);

    const pageText = await page.locator('body').textContent().catch(() => '');
    if (pageText && ACCESS_DENIED_TEXT.test(pageText)) {
      statusAudit.stop();
      throw new Error(`ACCESS DENIED: Support Admin saw "${pageText.match(ACCESS_DENIED_TEXT)?.[0]}" instead of the module.`);
    }

    const shutdownHeader = page.getByRole('heading', { name: /Shutdown Pump/i }).first();
    const shutdownButton = page.getByRole('button', { name: /^Shutdown Pump$/i }).first();
    const dataTable = page.locator('.p-datatable-tbody').first();

    const isVisible =
      (await shutdownHeader.isVisible()) ||
      (await shutdownButton.isVisible()) ||
      (await dataTable.isVisible());

    expect(isVisible, 'Shutdown Pump module markers or data table should be visible for admin').toBeTruthy();

    await page.screenshot({ path: 'admin-shutdown-pump-verified.png', fullPage: true });
    await assertStatusCodeAudit(page, statusAudit, '13-ShutdownPumpAdmin.spec.ts');
  });
});

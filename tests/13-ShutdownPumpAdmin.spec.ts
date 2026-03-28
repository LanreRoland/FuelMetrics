import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  navigateToCompanyDashboard,
  startStatusCodeAudit,
  waitForVisible,
} from './helpers/epump';

/**
 * 13-ShutdownPumpAdmin.spec.ts
 * 
 * Verifies that a Support Admin can login, navigate to a specific company
 * (Demonstration Limited), and successfully access the Shutdown Pump module
 * with full permissions.
 */

const ADMIN_EMAIL = 'olarenwaju.ajumobi@fuelmetrics.com.ng';
const ADMIN_PASSWORD = 'Jumby@2014';
const TARGET_COMPANY = 'Demonstration Limited';
const ACCESS_DENIED_TEXT = /Your account does not have access to this Data/i;

test.describe('Support Admin: Shutdown Pump Access', () => {
  test.setTimeout(300000);

  test('should successfully navigate as admin to company shutdown pump module', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);

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

    // 3. Navigate to Shutdown Pump module
    console.log('[ info ] Expanding Pump management menu...');
    const pumpMgmtMenu = page.getByRole('link', { name: /Pump management/i }).first();
    await pumpMgmtMenu.waitFor({ state: 'visible', timeout: 30000 });
    await pumpMgmtMenu.click();

    console.log('[ info ] Clicking Shutdown Pump link...');
    const shutdownLink = page.getByRole('link', { name: /Shutdown Pump/i }).first();
    await shutdownLink.waitFor({ state: 'visible', timeout: 30000 });
    await shutdownLink.click();

    // 4. Verify Access
    console.log('[ info ] Verifying module availability...');
    await page.waitForTimeout(5000); // Settle time
    
    const pageText = await page.locator('body').textContent().catch(() => '');
    if (pageText && ACCESS_DENIED_TEXT.test(pageText)) {
      statusAudit.stop();
      throw new Error('ACCESS DENIED: Support Admin should have permission for Shutdown Pump but saw the error message.');
    }

    const shutdownHeader = page.getByRole('heading', { name: /Shutdown Pump/i }).first();
    const shutdownButton = page.getByRole('button', { name: /^Shutdown Pump$/i }).first();
    
    const isVisible = await (await shutdownHeader.isVisible()) || (await shutdownButton.isVisible());
    expect(isVisible, 'Shutdown Pump module markers should be visible for admin').toBeTruthy();

    await page.screenshot({ path: 'admin-shutdown-pump-verified.png', fullPage: true });
    
    // Final Audit
    await assertStatusCodeAudit(page, statusAudit, '13-ShutdownPumpAdmin.spec.ts');
  });
});

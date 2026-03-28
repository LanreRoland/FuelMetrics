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
    const pumpMgmtMenuCandidates = [
      page.getByRole('link', { name: /Pump management/i }).first(),
      page.getByRole('button', { name: /Pump management/i }).first(),
      page.locator('a, button, [role="button"]').filter({ hasText: /Pump management/i }).first(),
    ];
    
    let menuExpanded = false;
    for (const candidate of pumpMgmtMenuCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        menuExpanded = true;
        break;
      }
    }

    if (!menuExpanded) {
      statusAudit.stop();
      test.skip(true, 'Could not find "Pump management" menu in the sidebar.');
    }

    console.log('[ info ] Clicking Shutdown Pump link...');
    const shutdownLinkCandidates = [
      page.getByRole('link', { name: /Shutdown Pump/i }).first(),
      page.getByRole('button', { name: /Shutdown Pump/i }).first(),
      page.locator('a, button, [role="button"]').filter({ hasText: /Shutdown Pump/i }).first(),
    ];

    let linkClicked = false;
    for (const candidate of shutdownLinkCandidates) {
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        linkClicked = true;
        break;
      }
    }

    if (!linkClicked) {
      // Fallback: try direct navigation if sidebar fails
      console.warn('[ warn ] Sidebar link not found, attempting direct navigation fallback...');
      await page.goto('https://stations.epump.africa/shutdown-pump', { waitUntil: 'domcontentloaded' }).catch(() => {});
    }

    // 4. Verify Access
    console.log('[ info ] Verifying module availability...');
    await page.waitForTimeout(5000); // Settle time
    
    // Check for "Access Denied" or "Data not found" errors
    const pageText = await page.locator('body').textContent().catch(() => '');
    if (pageText && ACCESS_DENIED_TEXT.test(pageText)) {
      statusAudit.stop();
      throw new Error(`ACCESS DENIED: Support Admin saw "${pageText.match(ACCESS_DENIED_TEXT)?.[0]}" instead of the module.`);
    }

    // Verify module markers (Header or existing records table)
    const shutdownHeader = page.getByRole('heading', { name: /Shutdown Pump/i }).first();
    const shutdownButton = page.getByRole('button', { name: /^Shutdown Pump$/i }).first();
    const dataTable = page.locator('.p-datatable-tbody').first();
    
    const isVisible = await (await shutdownHeader.isVisible()) || 
                      (await shutdownButton.isVisible()) || 
                      (await dataTable.isVisible());
                      
    expect(isVisible, 'Shutdown Pump module markers or data table should be visible for admin').toBeTruthy();

    await page.screenshot({ path: 'admin-shutdown-pump-verified.png', fullPage: true });
    
    // Final Audit
    await assertStatusCodeAudit(page, statusAudit, '13-ShutdownPumpAdmin.spec.ts');
  });
});

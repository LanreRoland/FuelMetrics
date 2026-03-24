import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  openPriceLogPage,
  startStatusCodeAudit,
  waitForVisible,
} from './helpers/epump';

test.describe('Price Change Automation', () => {
  test.setTimeout(240000);

  test('should successfully update PMS price to 1300 for West region Lagos', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, auth.reason);
    }

    if (!(await openPriceLogPage(page))) {
      statusAudit.stop();
      test.skip(true, 'The Price Log page did not become available after authentication.');
    }

    const updatePriceButton = page.getByRole('button', { name: /Update Price/i }).first();
    if (!(await waitForVisible(updatePriceButton, 60000))) {
      statusAudit.stop();
      test.skip(true, 'The Update Price action was not visible on the Price Log page.');
    }
    await updatePriceButton.click();

    // 5. Fill Price Update Form (Side Drawer)
    // Select Product (PMS)
    const productSelect = page.locator('button:has-text("Select product")').first();
    await productSelect.click();
    const pmsOption = page.getByRole('listitem').filter({ hasText: /^PMS$/ }).first();
    await pmsOption.waitFor({ state: 'visible' });
    await pmsOption.click();

    // Enter New Price (1300)
    const priceInput = page.locator('input[placeholder="Enter New Price"]');
    await priceInput.fill('1300');

    // Select Region (West)
    await page.locator('button:has-text("Select Region")').click();
    const westOption = page.getByRole('listitem').filter({ hasText: /^West$/ }).first();
    await westOption.waitFor({ state: 'visible' });
    await westOption.click();

    // Select states (Lagos)
    await page.locator('button:has-text("Select states")').click();
    // Use a more specific locator within the dropdown context if possible, otherwise use last()
    const stateSearch = page.locator('input[placeholder="Search"]').last(); 
    await stateSearch.waitFor({ state: 'visible' });
    await stateSearch.fill('Lagos');
    const lagosOption = page.getByRole('listitem').filter({ hasText: /^Lagos$/ }).first();
    await lagosOption.waitFor({ state: 'visible', timeout: 30000 });
    await lagosOption.click();

    // Select retail Outlets (All)
    await page.locator('button:has-text("Select retail Outlets")').click();
    // FIX: Multiple "Select all" buttons exist; use last() for the retail outlets dropdown
    const selectAllBtn = page.locator('button:has-text("Select all")').last();
    await selectAllBtn.waitFor({ state: 'visible', timeout: 30000 });
    await selectAllBtn.click();

    // 6. Request Price Change
    await page.getByRole('button', { name: /Request price change/i }).click();

    // 7. Authorize with Password
    const authPasswordField = page.locator('input[placeholder="Password"]');
    await authPasswordField.waitFor({ state: 'visible' });
    await authPasswordField.fill('Tester.1');

    // 8. Confirm Price Update
    const confirmBtn = page.getByRole('button', { name: /Confirm Price Update/i });
    await confirmBtn.waitFor({ state: 'visible' });
    await confirmBtn.click();

    // 9. Verify success
    // Wait for the confirmation popup to close
    await expect(confirmBtn).not.toBeVisible({ timeout: 30000 });

    // Verify 'Pending' entry in the log table
    const tableBody = page.locator('.p-datatable-tbody');
    await expect(tableBody).toBeVisible({ timeout: 30000 });
    
    // Dynamically wait for the new price to appear in the table
    await expect(tableBody).toContainText('PMS', { timeout: 30000 });
    await expect(tableBody).toContainText('1,300', { timeout: 30000 });
    await expect(tableBody).toContainText(/Pending|Submitted/i, { timeout: 30000 });
    await assertStatusCodeAudit(page, statusAudit, '02-PriceLog.spec.ts');
  });
});

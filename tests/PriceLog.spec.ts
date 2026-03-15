import { test, expect } from '@playwright/test';

test.describe('Price Change Automation', () => {
  test.setTimeout(90000); // Increase timeout for the whole test to 90s

  test('should successfully update PMS price to 1300 for West region Lagos', async ({ page }) => {
    // 1. Open the website with a retry loop and safer wait strategy
    const maxRetries = 3;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        // Use 'networkidle' for the initial load to ensure the portal's complex scripts are fully ready
        await page.goto('https://stations.epump.africa/', { waitUntil: 'networkidle', timeout: 60000 });
        break;
      } catch (error) {
        if (i === maxRetries) throw error;
        console.log(`Navigation failed, retry ${i}/${maxRetries}...`);
        await page.waitForTimeout(5000);
      }
    }

    // 2. Conditional Login: Handle cases where you might already be logged in
    const emailLocator = page.locator('input[type="email"], [placeholder*="email" i]').first();
    const isLoginPage = await emailLocator.isVisible({ timeout: 5000 }).catch(() => false);

    if (isLoginPage) {
      await emailLocator.fill('mikeandmike@mailinator.com');
      const passwordInput = page.locator('input[type="password"]').first();
      await passwordInput.fill('Tester.1');
      
      // Press Enter to submit the form, which is often more reliable than just a button click
      await passwordInput.press('Enter');
      
      // Also click the button as a fallback
      const loginBtn = page.getByRole('button', { name: /Sign in|Sign-in|Login/i }).first();
      if (await loginBtn.isVisible()) {
          await loginBtn.click().catch(() => {});
      }
    }

    // Wait for dashboard content to load - more reliable than just checking the URL
    // We'll look for any element containing "Price management" as a sign of success
    const dashboardSuccess = page.locator('text=Price management').first();
    await dashboardSuccess.waitFor({ state: 'visible', timeout: 60000 });

    // 3. Navigate to Price Management > Price Log
    // Use a more specific locator to avoid strict mode violations
    await page.getByText('Price management', { exact: true }).first().click();
    await page.getByRole('link', { name: 'Price Log' }).first().click();
    await page.waitForLoadState('networkidle');

    // 4. Click Update Price
    await page.getByRole('button', { name: 'Update Price' }).first().click();

    // 5. Fill Price Update Form (Side Drawer)
    // Select Product (PMS)
    await page.locator('button:has-text("Select product")').click();
    const pmsOption = page.locator('li:has-text("PMS")').first();
    await pmsOption.waitFor({ state: 'visible' });
    await pmsOption.click();

    // Enter New Price (1300)
    const priceInput = page.locator('input[placeholder="Enter New Price"]');
    await priceInput.fill('1300');

    // Select Region (West)
    await page.locator('button:has-text("Select Region")').click();
    const westOption = page.locator('li:has-text("West")').first();
    await westOption.waitFor({ state: 'visible' });
    await westOption.click();

    // Select states (Lagos)
    await page.locator('button:has-text("Select states")').click();
    // Use a more specific locator within the dropdown context if possible, otherwise use last()
    const stateSearch = page.locator('input[placeholder="Search"]').last(); 
    await stateSearch.waitFor({ state: 'visible' });
    await stateSearch.fill('Lagos');
    const lagosOption = page.locator('li:has-text("Lagos")').first();
    await lagosOption.waitFor({ state: 'visible', timeout: 30000 });
    await lagosOption.click();

    // Select retail Outlets (All)
    await page.locator('button:has-text("Select retail Outlets")').click();
    // FIX: Multiple "Select all" buttons exist; use last() for the retail outlets dropdown
    const selectAllBtn = page.locator('button:has-text("Select all")').last();
    await selectAllBtn.waitFor({ state: 'visible', timeout: 30000 });
    await selectAllBtn.click();

    // 6. Request Price Change
    await page.locator('button:has-text("Request price change")').click();

    // 7. Authorize with Password
    const authPasswordField = page.locator('input[placeholder="Password"]');
    await authPasswordField.waitFor({ state: 'visible' });
    await authPasswordField.fill('Tester.1');

    // 8. Confirm Price Update
    const confirmBtn = page.locator('button:has-text("Confirm Price Update")').first();
    await confirmBtn.waitFor({ state: 'visible' });
    await confirmBtn.click();

    // 9. Verify success
    // Wait for the confirmation popup to close
    await expect(confirmBtn).not.toBeVisible({ timeout: 30000 });

    // Give the database a moment to reflect the change before checking the table
    // We'll wait for the new entry to appear without a hard reload if possible
    await page.waitForTimeout(5000);

    // Verify 'Pending' entry in the log table
    const tableBody = page.locator('.p-datatable-tbody');
    await expect(tableBody).toContainText('PMS', { timeout: 30000 });
    await expect(tableBody).toContainText('1,300', { timeout: 30000 });
    await expect(tableBody).toContainText(/Pending|Submitted/i, { timeout: 30000 });
  });
});

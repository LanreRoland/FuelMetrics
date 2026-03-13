import { test, expect } from '@playwright/test';

test.describe('Price Change Automation', () => {
  test.setTimeout(60000); // Increase timeout for the whole test

  test('should successfully update PMS price to 1300 for West region Lagos', async ({ page }) => {
    // 1. Open the website
    await page.goto('https://stations.epump.africa/');

    // Ensure the app loads dynamically
    await page.waitForLoadState('networkidle');

    // 2. Conditional Login
    const emailInput = page.locator('input[type="email"], input[name*="email" i], [placeholder*="email" i]').first();
    if (await emailInput.isVisible({ timeout: 5000 })) {
      await emailInput.fill('mikeandmike@mailinator.com');
      const passwordInput = page.locator('input[type="password"], [placeholder*="password" i]').first();
      await passwordInput.fill('Tester.1');
      const loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In")').first();
      await loginButton.click();
    }

    // Wait for dashboard to load
    await expect(page).toHaveURL(/.*dashboard.*/i, { timeout: 15000 });

    // 3. Navigate to Price Management > Price Log
    await page.locator('div:has-text("Price management")').click();
    await page.locator('a[href="/price-log"]').click();
    await page.waitForLoadState('networkidle');

    // 4. Click Update Price
    await page.locator('button:has-text("Update Price")').click();

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
    const stateSearch = page.locator('input[placeholder="Search"]');
    await stateSearch.waitFor({ state: 'visible' });
    await stateSearch.fill('Lagos');
    const lagosOption = page.locator('li:has-text("Lagos")').first();
    await lagosOption.waitFor({ state: 'visible' });
    await lagosOption.click();
    
    // Select retail Outlets (All)
    await page.locator('button:has-text("Select retail Outlets")').click();
    const selectAllBtn = page.locator('button:has-text("Select all")');
    await selectAllBtn.waitFor({ state: 'visible' });
    await selectAllBtn.click();
    
    // 6. Request Price Change
    await page.locator('button:has-text("Request price change")').click();

    // 7. Authorize with Password
    const authPasswordField = page.locator('input[placeholder="Password"]');
    await authPasswordField.waitFor({ state: 'visible' });
    await authPasswordField.fill('Tester.1');

    // 8. Confirm Price Update
    const confirmBtn = page.locator('button:has-text("Confirm Price Update")');
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

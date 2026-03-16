import { test, expect } from '@playwright/test';

test.describe('Price Approval Automation', () => {
  test.setTimeout(120000); // 2 minutes to accommodate login + navigation

  test.beforeEach(async ({ page }) => {
    // 1. Open the website with a safer wait strategy
    await page.goto('https://stations.epump.africa/', { waitUntil: 'load', timeout: 60000 });

    const emailLocator = page.locator('input[type="email"], [placeholder*="email" i]').first();
    const isLoginPage = await emailLocator.isVisible({ timeout: 5000 }).catch(() => false);

    if (isLoginPage) {
      await emailLocator.fill('mikeandmike@mailinator.com');
      await page.locator('input[type="password"]').first().fill('Tester.1');
      await page.getByRole('button', { name: /Sign in|Sign-in|Login/i }).first().click();
      await page.waitForURL(/.*dashboard.*/i, { timeout: 30000 }).catch(() => { });
    }

    // 2. Navigate to Price Management > Price approval
    const priceMenu = page.getByText('Price management', { exact: true }).first();
    await priceMenu.waitFor({ state: 'visible', timeout: 30000 });
    await priceMenu.click();

    const approvalLink = page.getByRole('link', { name: 'Price approval' }).first();
    await approvalLink.waitFor({ state: 'visible' });
    await approvalLink.click();

    // 3. Wait for the approval table to appear instead of a broad networkidle
    await page.getByText(/price change request/i).first().waitFor({ state: 'visible', timeout: 30000 });
  });

  test('Single Approval: Successfully approve a single price request', async ({ page }) => {
    // Locate the first 'Approve' button in the table
    const approveBtn = page.getByRole('button', { name: /Approve/i }).first();
    await approveBtn.waitFor({ state: 'visible', timeout: 30000 });

    // Click Approve
    await approveBtn.click();

    // Verification: Handle the confirmation or check for a success message/re-render
    // For now, we expect the button or row to disappear/update
    await expect(approveBtn).not.toBeVisible({ timeout: 15000 });
    console.log('[Info] Single approval submitted successfully.');
  });

  test('Bulk Approval: Successfully approve multiple price requests', async ({ page }) => {
    // 1. Select all items using the header checkbox
    const selectAllCheckbox = page.locator('.p-column-header-content input[type="checkbox"], thead input[type="checkbox"]').first();
    await selectAllCheckbox.waitFor({ state: 'visible' });
    await selectAllCheckbox.click();

    // 2. Wait for the bulk action footer to appear and click the main 'Approve' button
    // Based on the screenshot, it's a green button at the bottom right
    const bulkApproveBtn = page.locator('div.flex.justify-content-end button').filter({ hasText: 'Approve' }).last();
    await bulkApproveBtn.waitFor({ state: 'visible' });
    await bulkApproveBtn.click();

    // 3. Verification
    // Expect the table to empty or show a success toast
    const emptyMessage = page.getByText(/no price change request|Empty/i);
    // Since we approved all, we might expect an empty state or the selection to clear
    await expect(bulkApproveBtn).not.toBeVisible();
    console.log('[Info] Bulk approval submitted successfully.');
  });
});

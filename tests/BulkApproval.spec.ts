import { test, expect } from '@playwright/test';

test.describe('Bulk Price Approval', () => {
  test.setTimeout(120000);

  test.beforeEach(async ({ page }) => {
    await page.goto('https://stations.epump.africa/', { waitUntil: 'load', timeout: 60000 });
    
    const emailLocator = page.locator('input[type="email"], [placeholder*="email" i]').first();
    const isLoginPage = await emailLocator.isVisible({ timeout: 5000 }).catch(() => false);

    if (isLoginPage) {
      await emailLocator.fill('mikeandmike@mailinator.com');
      await page.locator('input[type="password"]').first().fill('Tester.1');
      await page.getByRole('button', { name: /Sign in|Sign-in|Login/i }).first().click();
      await page.waitForURL(/.*dashboard.*/i, { timeout: 30000 }).catch(() => {});
    }

    const priceMenu = page.getByText('Price management', { exact: true }).first();
    await priceMenu.waitFor({ state: 'visible', timeout: 30000 });
    await priceMenu.click();

    const approvalLink = page.getByRole('link', { name: 'Price approval' }).first();
    await approvalLink.waitFor({ state: 'visible' });
    await approvalLink.click();
    
    await page.getByText(/price change request/i).first().waitFor({ state: 'visible', timeout: 30000 });
  });

  test('Successfully approve multiple price requests', async ({ page }) => {
    const selectAllCheckbox = page.locator('.p-column-header-content input[type="checkbox"], thead input[type="checkbox"]').first();
    await selectAllCheckbox.waitFor({ state: 'visible' });
    await selectAllCheckbox.click();

    const bulkApproveBtn = page.locator('div.flex.justify-content-end button').filter({ hasText: 'Approve' }).last();
    await bulkApproveBtn.waitFor({ state: 'visible' });
    await bulkApproveBtn.click();

    await expect(bulkApproveBtn).not.toBeVisible();
  });
});

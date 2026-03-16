import { test, expect } from '@playwright/test';

test.describe('Single Price Approval', () => {
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

    // 3. Robust wait: Wait for the main table content or an empty state indicator
    await Promise.race([
      page.getByRole('button', { name: /Approve/i }).first().waitFor({ state: 'visible', timeout: 30000 }),
      page.getByText(/no price change request|empty/i).first().waitFor({ state: 'attached', timeout: 30000 })
    ]).catch(() => {
      // Fallback: Just ensure we are on the right URL
      return expect(page).toHaveURL(/.*approval.*/i, { timeout: 10000 });
    });
  });

  test('Successfully approve a single price request', async ({ page }) => {
    const approveBtn = page.getByRole('button', { name: /Approve/i }).first();
    await approveBtn.waitFor({ state: 'visible', timeout: 30000 });
    await approveBtn.click();
    await expect(approveBtn).not.toBeVisible({ timeout: 15000 });
  });
});

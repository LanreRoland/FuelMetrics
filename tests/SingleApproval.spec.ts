import { test, expect } from '@playwright/test';

test.describe('Single Price Approval', () => {
  test.setTimeout(180000); // 3 minutes for CI environments

  test.beforeEach(async ({ page }) => {
    // 1. Navigate with retry loop
    const maxRetries = 3;
    for (let i = 1; i <= maxRetries; i++) {
      try {
        await page.goto('https://stations.epump.africa/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        break;
      } catch (error) {
        if (i === maxRetries) throw error;
        console.log(`[SingleApproval] Navigation retry ${i}/${maxRetries}...`);
        await page.waitForTimeout(5000);
      }
    }

    // 2. Login
    const emailLocator = page.locator('input[type="email"], [placeholder*="email" i]').first();
    const isLoginPage = await emailLocator.isVisible({ timeout: 10000 }).catch(() => false);

    if (isLoginPage) {
      await emailLocator.fill('mikeandmike@mailinator.com');
      await page.locator('input[type="password"]').first().fill('Tester.1');
      await page.getByRole('button', { name: /Sign in|Sign-in|Login/i }).first().click();
      await page.waitForURL(/.*dashboard.*/i, { timeout: 45000 }).catch(() => {});
      // Critical: Wait for the dashboard to fully render after login
      await page.waitForLoadState('load');
    }

    // 3. Navigate to Price Management > Price Approval
    const priceMenu = page.getByText('Price management', { exact: true }).first();
    await priceMenu.waitFor({ state: 'visible', timeout: 60000 });
    await priceMenu.click();

    const approvalLink = page.getByRole('link', { name: 'Price approval' }).first();
    await approvalLink.waitFor({ state: 'visible', timeout: 30000 });
    await approvalLink.click();

    // 4. Wait for approval page content to load
    await Promise.race([
      page.getByRole('button', { name: /Approve/i }).first().waitFor({ state: 'visible', timeout: 60000 }),
      page.getByText(/no price change request|empty/i).first().waitFor({ state: 'attached', timeout: 60000 })
    ]).catch(() => {
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

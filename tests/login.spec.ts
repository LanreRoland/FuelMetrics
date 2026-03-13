import { test, expect } from '@playwright/test';

test.describe('Epump Login Automation', () => {
  test('should execute the login flow completely', async ({ page }) => {
    // 1. Open the website
    await page.goto('https://stations.epump.africa/');

    // Ensure the app loads dynamically
    await page.waitForLoadState('networkidle');

    // 2. Enter email
    // A robust locator covering standard email inputs
    const emailInput = page.locator('input[type="email"], input[name*="email" i], input[name*="username" i], [placeholder*="email" i]').first();
    await emailInput.waitFor({ state: 'visible' });
    await emailInput.fill('mikeandmike@mailinator.com');

    // 3. Enter password
    const passwordInput = page.locator('input[type="password"], input[name*="password" i], [placeholder*="password" i]').first();
    await passwordInput.waitFor({ state: 'visible' });
    await passwordInput.fill('Tester.1');

    // 4. Click login
    const loginButton = page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign In"), input[type="submit"]').first();
    await loginButton.waitFor({ state: 'visible' });
    await loginButton.click();

    // 5. Verify the dashboard loads
    // Adjust the regex or timeout based on real network latency and target URLs
    // Assuming the application navigates to a dashboard URL upon successful login
    await expect(page).toHaveURL(/.*dashboard.*/i, { timeout: 15000 });
  });
});

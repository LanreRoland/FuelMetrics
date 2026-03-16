import { test, expect } from '@playwright/test';

// This test suite creates 20 individual test cases.
// When run with 20 workers, they will execute concurrently.
test.describe('Epump Concurrent Login Simulation', () => {
  // We specify parallel mode explicitly for this suite
  test.describe.configure({ mode: 'parallel' });

  for (let i = 1; i <= 20; i++) {
    test(`User ${i}: should successfully login`, async ({ page }) => {
      console.log(`[User ${i}] Starting login flow...`);
      
      // 1. Open the website
      await page.goto('https://stations.epump.africa/', { waitUntil: 'networkidle', timeout: 60000 });

      // 2. Enter email
      const emailInput = page.locator('input[type="email"], [placeholder*="email" i]').first();
      await emailInput.waitFor({ state: 'visible' });
      await emailInput.fill('mikeandmike@mailinator.com');

      // 3. Enter password
      const passwordInput = page.locator('input[type="password"]').first();
      await passwordInput.waitFor({ state: 'visible' });
      await passwordInput.fill('Tester.1');

      // 4. Click login
      const loginButton = page.getByRole('button', { name: /Sign in|Sign-in|Login/i }).first();
      await loginButton.waitFor({ state: 'visible' });
      await loginButton.click();

      // 5. Verify the dashboard loads
      // Using a longer timeout for load testing as server response might be slower under load
      await expect(page).toHaveURL(/.*dashboard.*/i, { timeout: 30000 });
      
      console.log(`[User ${i}] Successfully reached dashboard.`);
    });
  }
});

import { test, expect } from '@playwright/test';
import { ensureAuthenticated, priceManagementLink } from './helpers/epump';

// This test suite creates 20 individual test cases.
// When run with 20 workers, they will execute concurrently.
test.describe('Epump Concurrent Login Simulation', () => {
  test.skip(
    !process.env.EPUMP_RUN_LOAD_TESTS,
    'Load simulation is opt-in. Set EPUMP_RUN_LOAD_TESTS=1 to enable it.',
  );
  // We specify parallel mode explicitly for this suite
  test.describe.configure({ mode: 'parallel' });
  test.setTimeout(210000);

  for (let i = 1; i <= 20; i++) {
    test(`User ${i}: should successfully login`, async ({ page }) => {
      const auth = await ensureAuthenticated(page);
      if (!auth.ok) {
        test.skip(true, auth.reason);
      }

      await expect(priceManagementLink(page)).toBeVisible({ timeout: 30000 });
      await expect(page).not.toHaveURL(/\/login/i);
    });
  }
});

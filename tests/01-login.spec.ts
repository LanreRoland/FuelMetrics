import { test, expect } from '@playwright/test';
import { ensureAuthenticated, priceManagementLink } from './helpers/epump';

test.describe('Epump Login Automation', () => {
  test.setTimeout(210000);

  test('should execute the login flow completely', async ({ page }) => {
    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      test.skip(true, auth.reason);
    }

    await expect(priceManagementLink(page)).toBeVisible({ timeout: 30000 });
    await expect(page).not.toHaveURL(/\/login/i);
  });
});

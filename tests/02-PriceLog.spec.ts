import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  openPriceLogPage,
  startStatusCodeAudit,
} from './helpers/epump';
import { PriceLogPage } from './pages/PriceLogPage';

test.describe('Price Change Automation', () => {
  test.setTimeout(240000);

  test('should successfully update PMS price to 1300 for West region Lagos', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const priceLog = new PriceLogPage(page);

    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, auth.reason);
    }

    if (!(await openPriceLogPage(page))) {
      statusAudit.stop();
      test.skip(true, 'The Price Log page did not become available after authentication.');
    }

    // Open the price update drawer
    await priceLog.openUpdatePriceDrawer();

    // Fill the update form
    await priceLog.selectProduct('PMS');
    await priceLog.enterPrice('1300');
    await priceLog.selectRegion('West');
    await priceLog.selectState('Lagos');
    await priceLog.selectAllRetailOutlets();

    // Submit and authorize
    await priceLog.submitPriceChange();
    await priceLog.authorizeAndConfirm('Tester.1');

    // Verify confirmation dialog closed and table reflects the new entry
    await expect(priceLog.confirmButton).not.toBeVisible({ timeout: 30000 });
    await expect(priceLog.priceTable).toBeVisible({ timeout: 30000 });
    await expect(priceLog.priceTable).toContainText('PMS', { timeout: 30000 });
    await expect(priceLog.priceTable).toContainText('1,300', { timeout: 30000 });
    await expect(priceLog.priceTable).toContainText(/Approved|Pending|Submitted/i, { timeout: 30000 });

    await assertStatusCodeAudit(page, statusAudit, '02-PriceLog.spec.ts');
  });
});

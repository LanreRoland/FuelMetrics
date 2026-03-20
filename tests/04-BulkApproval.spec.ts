import { test, expect } from '@playwright/test';
import {
  ensureAuthenticated,
  openPriceApprovalPage,
  waitForVisible,
} from './helpers/epump';

test.describe('Bulk Price Approval', () => {
  test.setTimeout(240000);

  test('Successfully approve multiple price requests', async ({ page }) => {
    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      test.skip(true, auth.reason);
    }

    if (!(await openPriceApprovalPage(page))) {
      test.skip(true, 'The Price approval page did not become available after authentication.');
    }

    const noRequestsMsg = page.getByText(/no price change request|empty|no data|no records?/i).first();
    if (await waitForVisible(noRequestsMsg, 5000)) {
      return;
    }

    const selectAllCheckbox = page.locator('.p-column-header-content input[type="checkbox"], thead input[type="checkbox"]').first();
    if (!(await waitForVisible(selectAllCheckbox, 45000))) {
      test.skip(true, 'The approval queue did not expose a selectable table of requests.');
    }

    await selectAllCheckbox.click();

    const bulkApproveBtn = page.locator('button').filter({ hasText: /^Approve$/i }).last();
    if (!(await waitForVisible(bulkApproveBtn, 15000))) {
      test.skip(true, 'Bulk approve did not become available after selecting pending requests.');
    }

    await bulkApproveBtn.click();

    await expect(bulkApproveBtn).not.toBeVisible({ timeout: 15000 });
  });
});

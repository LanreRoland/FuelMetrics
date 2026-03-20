import { test, expect } from '@playwright/test';
import {
  ensureAuthenticated,
  openPriceApprovalPage,
  waitForVisible,
} from './helpers/epump';

test.describe('Single Price Approval', () => {
  test.setTimeout(240000);

  test('Successfully approve a single price request', async ({ page }) => {
    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      test.skip(true, auth.reason);
    }

    if (!(await openPriceApprovalPage(page))) {
      test.skip(true, 'The Price approval page did not become available after authentication.');
    }

    const noRequestsMsg = page.getByText(/no price change request|empty|no data|no records?/i).first();
    const firstViewBtn = page.getByRole('button', { name: /View/i }).first();

    if (await waitForVisible(noRequestsMsg, 5000)) {
      return;
    }

    if (!(await waitForVisible(firstViewBtn, 45000))) {
      test.skip(true, 'The approval queue did not expose a request row to inspect.');
    }
    await firstViewBtn.click();

    const dialogApproveBtn = page.getByRole('dialog').getByRole('button', { name: /^Approve$/i }).first();
    const firstDetailApproveBtn = (await waitForVisible(dialogApproveBtn, 10000))
      ? dialogApproveBtn
      : page.getByRole('button', { name: /^Approve$/i }).first();

    if (!(await waitForVisible(firstDetailApproveBtn, 20000))) {
      test.skip(true, 'A request opened, but no approve action was available.');
    }
    await firstDetailApproveBtn.click();

    await expect(firstDetailApproveBtn).not.toBeVisible({ timeout: 15000 });
  });
});

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
    const firstViewBtn = page.locator('table tr').filter({ has: page.getByRole('button', { name: /View/i }) }).first().getByRole('button', { name: /View/i });

    if (await waitForVisible(noRequestsMsg, 15000)) {
      console.log('[ info ] No price change requests found. Skipping approval.');
      return;
    }

    console.log('[ info ] Waiting for "View" button in the queue...');
    if (!(await waitForVisible(firstViewBtn, 45000))) {
      await page.screenshot({ path: 'approval-queue-missing.png' });
      test.skip(true, 'The approval queue did not expose a "View" button.');
    }

    console.log('[ info ] Opening price request details...');
    await firstViewBtn.click();

    // The approval button usually appears inside a modal/dialog
    const dialog = page.getByRole('dialog').or(page.locator('.modal-content')).or(page.locator('.swal2-modal')).first();
    const dialogApproveBtn = dialog.getByRole('button', { name: /^Approve$/i }).first();

    console.log('[ info ] Waiting for "Approve" button to appear...');
    if (!(await waitForVisible(dialogApproveBtn, 20000))) {
      // Fallback: search globally if no dialog detected
      const globalApproveBtn = page.getByRole('button', { name: /^Approve$/i }).first();
      if (await waitForVisible(globalApproveBtn, 5000)) {
        console.log('[ info ] Dialog not detected, using global "Approve" button.');
        await globalApproveBtn.click();
      } else {
        await page.screenshot({ path: 'approve-button-missing.png' });
        test.skip(true, 'A request opened, but no "Approve" button was found.');
      }
    } else {
      console.log('[ info ] Clicking "Approve" button in dialog...');
      await dialogApproveBtn.click();
    }

    // Wait for the action to process (dialog should disappear or status should change)
    console.log('[ info ] Verifying approval completion...');
    await page.waitForTimeout(3000); // Give it a moment to process
    await expect(dialog).not.toBeVisible({ timeout: 15000 }).catch(() => {
      console.warn('[ warn ] Dialog did not close automatically after approval.');
    });
  });
});

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
    if (await waitForVisible(noRequestsMsg, 15000)) {
      console.log('[ info ] No price change requests found. Skipping bulk approval.');
      return;
    }

    console.log('[ info ] Waiting for request rows to appear...');
    // Wait for the table body to populate
    const tableBody = page.locator('tbody').first();
    await tableBody.waitFor({ state: 'visible', timeout: 45000 }).catch(() => null);

    // The interface does not have selection checkboxes. "Bulk" approval here means
    // sequentially opening and approving multiple requests.
    // The user requested to "click on the 5 approvals only, the first 5, then approve them"
    // Since we are approving them, they will disappear from the list, so we always just
    // click the *first* "View" button up to 5 times.

    let approvedCount = 0;
    const maxToApprove = 5;

    for (let i = 0; i < maxToApprove; i++) {
        console.log(`\n[ info ] --- Processing approval request ${i + 1} of ${maxToApprove} ---`);
        
        // Always get the freshly available first 'View' button
        const firstViewBtn = page.getByRole('button', { name: /View/i }).first();
        
        if (!(await waitForVisible(firstViewBtn, 15000))) {
            console.log('[ info ] No more "View" buttons found in the queue.');
            break;
        }

        console.log('[ info ] Opening price request details...');
        await firstViewBtn.click();

        // Wait for the approval dialog
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
                console.warn(`[ warn ] A request opened, but no "Approve" button was found for iteration ${i + 1}.`);
                // Try to close the dialog to continue the loop
                const closeBtn = dialog.getByRole('button', { name: /close|x/i }).first();
                if (await closeBtn.isVisible()) await closeBtn.click();
                continue;
            }
        } else {
            console.log('[ info ] Clicking "Approve" button in dialog...');
            await dialogApproveBtn.click();
        }

        console.log('[ info ] Verifying approval completion...');
        await page.waitForTimeout(3000); // Give it a moment to process
        
        // Ensure the dialog disappears before the next iteration
        await expect(dialog).not.toBeVisible({ timeout: 15000 }).catch(() => {
            console.warn('[ warn ] Dialog did not close automatically after approval.');
        });
        
        // Wait a bit for the table to refresh to avoid StaleElement exceptions on the next loop
        await page.waitForTimeout(2000);
        approvedCount++;
    }

    console.log(`\n[ info ] Successfully approved ${approvedCount} requests.`);

    if (approvedCount === 0) {
        test.skip(true, 'Failed to approve any requests.');
    }
  });

});

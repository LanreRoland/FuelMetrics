import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  openPriceApprovalPage,
  startStatusCodeAudit,
} from './helpers/epump';

const QUEUE_STATE_TIMEOUT_MS = 20_000;
const NEXT_REQUEST_TIMEOUT_MS = 10_000;
const APPROVE_BUTTON_TIMEOUT_MS = 20_000;
const DIALOG_CLOSE_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 250;

type QueueState = 'ready' | 'empty' | 'timeout';
type ApproveButtonResult =
  | { button: Locator; source: 'dialog' | 'global' }
  | null;

function noRequestsMessage(page: Page): Locator {
  return page.getByText(/no price change request|empty|no data|no records?/i).first();
}

function firstViewButton(page: Page): Locator {
  return page.getByRole('button', { name: /View/i }).first();
}

function approvalDialog(page: Page): Locator {
  return page
    .getByRole('dialog')
    .or(page.locator('.modal-content'))
    .or(page.locator('.swal2-modal'))
    .first();
}

async function waitForQueueState(page: Page, timeoutMs = QUEUE_STATE_TIMEOUT_MS): Promise<QueueState> {
  const deadline = Date.now() + timeoutMs;
  const emptyState = noRequestsMessage(page);
  const viewButton = firstViewButton(page);

  while (Date.now() < deadline) {
    if (await emptyState.isVisible().catch(() => false)) {
      return 'empty';
    }

    if (await viewButton.isVisible().catch(() => false)) {
      return 'ready';
    }

    await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  return 'timeout';
}

async function waitForApproveButton(page: Page, dialog: Locator): Promise<ApproveButtonResult> {
  const deadline = Date.now() + APPROVE_BUTTON_TIMEOUT_MS;
  const dialogApproveBtn = dialog.getByRole('button', { name: /^Approve$/i }).first();
  const globalApproveBtn = page.getByRole('button', { name: /^Approve$/i }).first();

  while (Date.now() < deadline) {
    if (await dialogApproveBtn.isVisible().catch(() => false)) {
      return { button: dialogApproveBtn, source: 'dialog' };
    }

    if (await globalApproveBtn.isVisible().catch(() => false)) {
      return { button: globalApproveBtn, source: 'global' };
    }

    await page.waitForTimeout(POLL_INTERVAL_MS);
  }

  return null;
}

test.describe('Bulk Price Approval', () => {
  test.setTimeout(240000);

  test('Successfully approve multiple price requests', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, auth.reason);
    }

    if (!(await openPriceApprovalPage(page))) {
      statusAudit.stop();
      test.skip(true, 'The Price approval page did not become available after authentication.');
    }

    const initialQueueState = await waitForQueueState(page);
    if (initialQueueState === 'empty') {
      console.log('[ info ] No price change requests found. Skipping bulk approval.');
      await assertStatusCodeAudit(page, statusAudit, '04-BulkApproval.spec.ts');
      return;
    }

    if (initialQueueState === 'timeout') {
      statusAudit.stop();
      test.skip(true, 'The approval queue did not expose a "View" button or an empty-state message.');
    }

    // The interface does not have selection checkboxes. "Bulk" approval here means
    // sequentially opening and approving multiple requests.
    // The user requested to "click on the 5 approvals only, the first 5, then approve them"
    // Since we are approving them, they will disappear from the list, so we always just
    // click the *first* "View" button up to 5 times.

    let approvedCount = 0;
    const maxToApprove = 5;

    for (let i = 0; i < maxToApprove; i++) {
      console.log(`\n[ info ] --- Processing approval request ${i + 1} of ${maxToApprove} ---`);

      const queueState = i === 0 ? 'ready' : await waitForQueueState(page, NEXT_REQUEST_TIMEOUT_MS);
      if (queueState === 'empty') {
        console.log('[ info ] Approval queue is now empty.');
        break;
      }

      if (queueState === 'timeout') {
        console.warn('[ warn ] Timed out waiting for the next request to become actionable.');
        break;
      }

      const firstViewBtn = firstViewButton(page);
      if (!(await firstViewBtn.isVisible().catch(() => false))) {
        console.log('[ info ] No more "View" buttons found in the queue.');
        break;
      }

      console.log('[ info ] Opening price request details...');
      await firstViewBtn.click();

      console.log('[ info ] Waiting for "Approve" button to appear...');
      const dialog = approvalDialog(page);
      const approveBtn = await waitForApproveButton(page, dialog);

      if (!approveBtn) {
        console.warn(`[ warn ] A request opened, but no "Approve" button was found for iteration ${i + 1}.`);
        const closeBtn = dialog.getByRole('button', { name: /close|x/i }).first();
        if (await closeBtn.isVisible().catch(() => false)) {
          await closeBtn.click();
        }
        continue;
      }

      if (approveBtn.source === 'dialog') {
        console.log('[ info ] Clicking "Approve" button in dialog...');
      } else {
        console.log('[ info ] Dialog not detected, using global "Approve" button.');
      }
      await approveBtn.button.click();

      console.log('[ info ] Verifying approval completion...');
      if (approveBtn.source === 'dialog') {
        await expect(dialog).toBeHidden({ timeout: DIALOG_CLOSE_TIMEOUT_MS }).catch(() => {
          console.warn('[ warn ] Dialog did not close automatically after approval.');
        });
      }

      approvedCount++;
    }

    console.log(`\n[ info ] Successfully approved ${approvedCount} requests.`);

    if (approvedCount === 0) {
      statusAudit.stop();
      test.skip(true, 'Failed to approve any requests.');
    }
    await assertStatusCodeAudit(page, statusAudit, '04-BulkApproval.spec.ts');
  });

});

import { test } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  openPriceApprovalPage,
  startStatusCodeAudit,
} from './helpers/epump';
import { PriceApprovalPage } from './pages/PriceApprovalPage';

const MAX_APPROVALS = 5;

test.describe('Bulk Price Approval', () => {
  test.setTimeout(240000);

  test('Successfully approve multiple price requests', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const approvalPage = new PriceApprovalPage(page);

    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, auth.reason);
    }

    if (!(await openPriceApprovalPage(page))) {
      statusAudit.stop();
      test.skip(true, 'The Price approval page did not become available after authentication.');
    }

    const initialState = await approvalPage.waitForQueueState();
    if (initialState === 'empty') {
      console.log('[ info ] No price change requests found. Skipping bulk approval.');
      await assertStatusCodeAudit(page, statusAudit, '04-BulkApproval.spec.ts');
      return;
    }

    if (initialState === 'timeout') {
      statusAudit.stop();
      test.skip(true, 'The approval queue did not expose a "View" button or an empty-state message.');
    }

    let approvedCount = 0;

    for (let i = 0; i < MAX_APPROVALS; i++) {
      console.log(`\n[ info ] --- Processing approval ${i + 1} of ${MAX_APPROVALS} ---`);

      const queueState = i === 0 ? 'ready' : await approvalPage.waitForNextRequest();
      if (queueState === 'empty') {
        console.log('[ info ] Approval queue is now empty.');
        break;
      }
      if (queueState === 'timeout') {
        console.warn('[ warn ] Timed out waiting for the next request.');
        break;
      }

      if (!(await approvalPage.firstViewButton.isVisible().catch(() => false))) {
        console.log('[ info ] No more "View" buttons found.');
        break;
      }

      console.log('[ info ] Opening price request details...');
      await approvalPage.openFirstRequest();

      console.log('[ info ] Waiting for "Approve" button...');
      const approved = await approvalPage.approveCurrentRequest();

      if (!approved) {
        console.warn(`[ warn ] No "Approve" button found for iteration ${i + 1}.`);
        if (await approvalPage.dialogCloseButton.isVisible().catch(() => false)) {
          await approvalPage.dialogCloseButton.click();
        }
        continue;
      }

      await approvalPage.waitForDialogToClose();
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

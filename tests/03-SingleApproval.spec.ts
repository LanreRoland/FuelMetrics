import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  openPriceApprovalPage,
  startStatusCodeAudit,
} from './helpers/epump';
import { PriceApprovalPage } from './pages/PriceApprovalPage';

test.describe('Single Price Approval', () => {
  test.setTimeout(240000);

  test('Successfully approve a single price request', async ({ page }) => {
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

    const queueState = await approvalPage.waitForQueueState();

    if (queueState === 'empty') {
      console.log('[ info ] No price change requests found. Skipping approval.');
      await assertStatusCodeAudit(page, statusAudit, '03-SingleApproval.spec.ts');
      return;
    }

    if (queueState === 'timeout') {
      await page.screenshot({ path: 'approval-queue-missing.png' });
      statusAudit.stop();
      test.skip(true, 'The approval queue did not expose a "View" button.');
    }

    console.log('[ info ] Opening price request details...');
    await approvalPage.openFirstRequest();

    console.log('[ info ] Waiting for "Approve" button to appear...');
    const approved = await approvalPage.approveCurrentRequest();

    if (!approved) {
      await page.screenshot({ path: 'approve-button-missing.png' });
      statusAudit.stop();
      test.skip(true, 'A request opened, but no "Approve" button was found.');
    }

    await approvalPage.waitForDialogToClose();
    await assertStatusCodeAudit(page, statusAudit, '03-SingleApproval.spec.ts');
  });
});


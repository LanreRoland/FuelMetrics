import { type Locator, type Page } from '@playwright/test';

const QUEUE_STATE_TIMEOUT_MS = 20_000;
const NEXT_REQUEST_TIMEOUT_MS = 10_000;
const APPROVE_BUTTON_TIMEOUT_MS = 20_000;

export type QueueState = 'ready' | 'empty' | 'timeout';

/**
 * Page Object Model for the Epump Price Approval page.
 * Handles the approval queue: detecting state, opening requests, and approving.
 */
export class PriceApprovalPage {
  readonly page: Page;

  // Locators
  readonly noRequestsMessage: Locator;
  readonly firstViewButton: Locator;
  readonly approvalDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.noRequestsMessage = page
      .getByText(/no price change request|empty|no data|no records?/i)
      .first();
    this.firstViewButton = page
      .getByRole('button', { name: /View/i })
      .first();
    this.approvalDialog = page
      .getByRole('dialog')
      .or(page.locator('.modal-content'))
      .or(page.locator('.swal2-modal'))
      .first();
  }

  /** The Approve button inside the open dialog. */
  get dialogApproveButton(): Locator {
    return this.approvalDialog
      .getByRole('button', { name: /^Approve$/i })
      .first();
  }

  /** Fallback global Approve button (when no dialog is detected). */
  get globalApproveButton(): Locator {
    return this.page
      .getByRole('button', { name: /^Approve$/i })
      .first();
  }

  /** Close button inside the dialog (used when no approve button is found). */
  get dialogCloseButton(): Locator {
    return this.approvalDialog
      .getByRole('button', { name: /close|x/i })
      .first();
  }

  /**
   * Wait for the queue to resolve to a known state.
   * Returns 'empty', 'ready', or 'timeout'.
   */
  async waitForQueueState(timeoutMs = QUEUE_STATE_TIMEOUT_MS): Promise<QueueState> {
    try {
      await this.noRequestsMessage
        .or(this.firstViewButton)
        .waitFor({ state: 'visible', timeout: timeoutMs });

      if (await this.noRequestsMessage.isVisible()) return 'empty';
      return 'ready';
    } catch {
      return 'timeout';
    }
  }

  /** Wait for the next queue item to become available after an approval. */
  async waitForNextRequest(): Promise<QueueState> {
    return this.waitForQueueState(NEXT_REQUEST_TIMEOUT_MS);
  }

  /** Click the first "View" button to open a price request. */
  async openFirstRequest(): Promise<void> {
    await this.firstViewButton.click();
  }

  /**
   * Resolve the Approve button from either the dialog or globally.
   * Returns null if neither becomes visible within the timeout.
   */
  async resolveApproveButton(): Promise<Locator | null> {
    try {
      await this.dialogApproveButton
        .or(this.globalApproveButton)
        .waitFor({ state: 'visible', timeout: APPROVE_BUTTON_TIMEOUT_MS });

      if (await this.dialogApproveButton.isVisible()) return this.dialogApproveButton;
      return this.globalApproveButton;
    } catch {
      return null;
    }
  }

  /** Click the resolved Approve button. Returns false if not found. */
  async approveCurrentRequest(): Promise<boolean> {
    const btn = await this.resolveApproveButton();
    if (!btn) return false;
    await btn.click();
    return true;
  }

  /** Wait for the dialog to close after an approval action. */
  async waitForDialogToClose(timeout = 15_000): Promise<void> {
    await this.approvalDialog
      .waitFor({ state: 'hidden', timeout })
      .catch(() => {
        console.warn('[ warn ] Dialog did not close automatically after approval.');
      });
  }
}

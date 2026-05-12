import { expect, type Locator, type Page } from '@playwright/test';

const EPUMP_ORIGIN = new URL(
  (process.env.EPUMP_URL || 'https://stations.epump.africa/login').trim(),
).origin;

const SHUTDOWN_PUMP_URL = `${EPUMP_ORIGIN}/shutdown-pump`;

function escapeRegex(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function exactTextRegex(v: string): RegExp {
  return new RegExp(`^\\s*${escapeRegex(v)}\\s*$`, 'i');
}

/**
 * Page Object Model for the Epump Shutdown Pump page.
 * Handles navigation, form interactions, and confirmation step.
 */
export class ShutdownPumpPage {
  readonly page: Page;

  // Surface marker locators
  readonly heading: Locator;
  readonly regionSelect: Locator;
  readonly shutdownText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: /Shutdown Pump/i }).first();
    this.regionSelect = page
      .locator('button, [role="button"], [role="combobox"]')
      .filter({ hasText: /Select Region/i })
      .first();
    this.shutdownText = page.getByText(/Shutdown Pump/i).first();
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  /** Navigate directly to the shutdown pump URL. */
  async goto(): Promise<void> {
    await this.page.goto(SHUTDOWN_PUMP_URL, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Poll until the shutdown pump page surface is confirmed visible.
   */
  async waitForSurface(timeoutMs = 45_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const markers = [this.heading, this.shutdownText, this.regionSelect];

    while (Date.now() < deadline) {
      if (this.page.url().toLowerCase().includes('shutdown-pump')) {
        for (const marker of markers) {
          if (await marker.isVisible().catch(() => false)) return true;
        }
      }
      await this.page.waitForTimeout(500);
    }
    return false;
  }

  /** Navigate to the page and confirm the surface is ready. */
  async navigateAndConfirm(timeoutMs = 45_000): Promise<boolean> {
    await this.goto();
    return this.waitForSurface(timeoutMs);
  }

  /** Returns true if the shutdown pump surface is currently visible. */
  async isReady(): Promise<boolean> {
    return (
      this.page.url().toLowerCase().includes('shutdown-pump') &&
      ((await this.heading.isVisible().catch(() => false)) ||
        (await this.regionSelect.isVisible().catch(() => false)))
    );
  }

  /**
   * Click through Pump management → Shutdown Pump in the sidebar,
   * with a direct URL fallback.
   */
  async navigateViaSidebar(): Promise<boolean> {
    // Expand "Pump management"
    await this._clickFirst(
      [
        this.page.getByRole('link', { name: /Pump management/i }).first(),
        this.page.getByRole('button', { name: /Pump management/i }).first(),
        this.page.locator('a, button, [role="button"]').filter({ hasText: /Pump management/i }).first(),
      ],
      'Pump management',
    );

    await this.page.waitForTimeout(2_000);

    // Click Shutdown Pump sub-item
    const shutdownCandidates = [
      this.page.getByRole('link', { name: /Shutdown Pump/i }).first(),
      this.page.getByRole('button', { name: /Shutdown Pump/i }).first(),
      this.page.locator('a, button, [role="button"]').filter({ hasText: /Shutdown Pump/i }).first(),
    ];

    const visible = await this._firstVisible(shutdownCandidates, 10_000);
    if (visible) {
      await this._clickFirst(shutdownCandidates, 'Shutdown Pump');
    } else {
      // Href fallback
      const href = await this.page.evaluate(() => {
        const match = Array.from(document.querySelectorAll('a')).find((a) => {
          const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
          return /shutdown pump/i.test(text) || /shutdown-pump/i.test(a.getAttribute('href') || '');
        });
        return match?.getAttribute('href') || null;
      });

      if (!href) {
        await this.page.goto(SHUTDOWN_PUMP_URL, { waitUntil: 'domcontentloaded' }).catch(() => {});
      } else {
        await this.page.goto(
          href.startsWith('http') ? href : `${EPUMP_ORIGIN}${href}`,
          { waitUntil: 'domcontentloaded' },
        );
      }
    }

    return this.waitForSurface(30_000);
  }

  /** Open the shutdown drawer by clicking the "Shutdown Pump" action button. */
  async openShutdownDrawer(): Promise<void> {
    await this._clickFirst(
      [
        this.page.getByRole('button', { name: /^Shutdown Pump$/i }).first(),
        this.page.locator('button, [role="button"]').filter({ hasText: /^Shutdown Pump$/i }).first(),
      ],
      'open shutdown drawer',
    );

    await expect(
      this._firstVisible([
        this.page.locator('button, [role="button"], [role="combobox"]').filter({ hasText: /Select Region/i }).first(),
        this.page.getByRole('button', { name: /Select states/i }).first(),
        this.page.locator('textarea[placeholder*="reason" i], input[placeholder*="reason" i]').first(),
      ]),
    ).resolves.not.toBeNull();
  }

  // ── Form interaction ─────────────────────────────────────────────────────────

  /** Select a single dropdown option. */
  async selectDropdownOption(label: RegExp, option: string): Promise<void> {
    await this._openSelect(label);
    await this._clickDropdownOption(option);
  }

  /** Open a multi-select and pick multiple options. */
  async selectMultipleOptions(label: RegExp, options: string[]): Promise<void> {
    await this._openSelect(label);
    for (const option of options) {
      const overlay = await this._visibleOverlay();
      if (!(await overlay.isVisible().catch(() => false))) await this._openSelect(label);
      await this._clickDropdownOption(option);
      await this.page.waitForTimeout(750);
    }
    await this.page.keyboard.press('Escape').catch(() => {});
  }

  /** Open a dropdown and click "Select all" (with fallback options). */
  async selectAll(label: RegExp, fallbackOptions: string[] = []): Promise<void> {
    await this._openSelect(label);
    const overlay = await this._visibleOverlay();

    const selectAllBtn = await this._firstVisible([
      overlay.getByRole('button', { name: /Select all/i }).last(),
      overlay.locator('button, [role="button"]').filter({ hasText: /Select all/i }).last(),
      this.page.getByRole('button', { name: /Select all/i }).last(),
      this.page.locator('button, [role="button"]').filter({ hasText: /Select all/i }).last(),
    ], 5_000);

    if (selectAllBtn) {
      await selectAllBtn.click().catch(async () => selectAllBtn.click({ force: true }));
      await this.page.waitForTimeout(1_000);
      await this.page.keyboard.press('Escape').catch(() => {});
      return;
    }

    for (const option of fallbackOptions) {
      const optionRegex = exactTextRegex(option);
      const target = await this._firstVisible([
        overlay.getByRole('option', { name: optionRegex }).first(),
        overlay.getByRole('listitem').filter({ hasText: optionRegex }).first(),
        overlay.locator('li, button, div, span').filter({ hasText: optionRegex }).first(),
      ], 3_000);
      if (target) {
        await target.click().catch(async () => target.click({ force: true }));
        await this.page.waitForTimeout(1_000);
        await this.page.keyboard.press('Escape').catch(() => {});
        return;
      }
    }

    throw new Error(`Could not select all for: ${String(label)}`);
  }

  /** Open the pump list and select all pumps. */
  async selectAllPumps(): Promise<void> {
    await this._clickFirst(
      [
        this.page.getByRole('button', { name: /^Pumps$/i }).last(),
        this.page.locator('button, [role="button"]').filter({ hasText: /^Pumps$/i }).last(),
        this.page.getByText(/Select pumps/i).first(),
      ],
      'Select pumps',
    );

    const selectAllBtn = await this._firstVisible([
      this.page.getByRole('button', { name: /Select all/i }).last(),
      this.page.locator('button, [role="button"]').filter({ hasText: /Select all/i }).last(),
    ], 10_000);

    if (selectAllBtn) {
      await selectAllBtn.click().catch(async () => selectAllBtn.click({ force: true }));
    } else {
      const overlay = await this._visibleOverlay();
      const checkboxRows = overlay.locator('[role="checkbox"], input[type="checkbox"]');
      const count = await checkboxRows.count().catch(() => 0);
      if (count === 0) throw new Error('Pump selection list opened but no selectable pumps were visible.');
      for (let i = 0; i < count; i++) {
        const row = checkboxRows.nth(i);
        if ((await row.getAttribute('aria-checked').catch(() => null)) !== 'true') {
          await row.click().catch(async () => row.click({ force: true }));
          await this.page.waitForTimeout(300);
        }
      }
    }

    await expect.poll(
      () => this.page.locator('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked').count().catch(() => 0),
      { timeout: 15_000 },
    ).toBeGreaterThan(0);

    await this.page.keyboard.press('Escape').catch(() => {});
  }

  /** Fill the shutdown reason textarea/input. */
  async fillShutdownReason(value: string): Promise<void> {
    const reasonField = await this._firstVisible([
      this.page.locator('textarea[placeholder*="reason" i]').first(),
      this.page.locator('input[placeholder*="reason" i]').first(),
      this.page.locator('textarea').last(),
    ], 10_000);

    if (!reasonField) throw new Error('The shutdown reason field was not visible.');
    await reasonField.fill(value);
  }

  /** The password field inside the confirmation modal. */
  get confirmationPasswordField(): Locator {
    return this.page.locator('input[type="password"]').last();
  }

  /** Fill the confirmation password field. */
  async fillConfirmationPassword(password: string): Promise<void> {
    await this.confirmationPasswordField.waitFor({ state: 'visible', timeout: 15_000 });
    await this.confirmationPasswordField.fill(password);
  }

  /** Click the final Shutdown/Confirm button. */
  async submitConfirmation(): Promise<void> {
    await this._clickFirst(
      [
        this.page.getByRole('button', { name: /^Shutdown$/i }).last(),
        this.page.locator('button, [role="button"]').filter({ hasText: /^Shutdown$/i }).last(),
        this.page.locator('button, [role="button"]').filter({ hasText: /Confirm|Proceed|Submit/i }).last(),
      ],
      'shutdown password confirmation',
    );
  }

  /** Check for an error toast after the shutdown action. Returns message or null. */
  async getErrorToastMessage(): Promise<string | null> {
    const toast = await this._firstVisible([
      this.page.locator('.p-toast-message-error').last(),
      this.page.locator('[role="alert"]').filter({ hasText: /Error|access/i }).last(),
      this.page.getByText(/Your account does not have access to this Data/i).last(),
    ], 1_000);

    if (!toast) return null;
    const text = (await toast.textContent().catch(() => '')) || '';
    return text.replace(/\s+/g, ' ').trim() || 'An error toast appeared after the shutdown action.';
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _firstVisible(candidates: Locator[], timeoutMs = 20_000): Promise<Locator | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      for (const locator of candidates) {
        if (await locator.isVisible().catch(() => false)) return locator;
      }
      await this.page.waitForTimeout(500);
    }
    return null;
  }

  private async _clickFirst(candidates: Locator[], description: string): Promise<void> {
    const target = await this._firstVisible(candidates);
    if (!target) throw new Error(`Could not find visible control for: ${description}`);
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.click().catch(async () => target.click({ force: true }));
  }

  private async _visibleOverlay(): Promise<Locator> {
    const candidates = [
      this.page.locator('.p-multiselect-panel:visible').last(),
      this.page.locator('.p-dropdown-panel:visible').last(),
      this.page.locator('.p-select-overlay:visible').last(),
      this.page.locator('.p-component-overlay:visible').last(),
      this.page.locator('[role="listbox"]:visible').last(),
      this.page.locator('[role="dialog"]:visible').last(),
    ];
    const overlay = await this._firstVisible(candidates, 3_000);
    return overlay || this.page.locator('body');
  }

  private async _openSelect(label: RegExp): Promise<void> {
    await this._clickFirst(
      [
        this.page.getByRole('button', { name: label }).first(),
        this.page.locator('button, [role="button"], [role="combobox"]').filter({ hasText: label }).first(),
        this.page.getByText(label).first(),
      ],
      String(label),
    );
    await this.page.waitForTimeout(1_000);
  }

  private async _clickDropdownOption(option: string): Promise<void> {
    const optionRegex = exactTextRegex(option);
    const overlay = await this._visibleOverlay();
    const searchInput = overlay.locator('input[placeholder*="Search" i], input[type="search"]').last();

    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.fill(option);
      await this.page.waitForTimeout(500);
    }

    await this._clickFirst(
      [
        overlay.getByRole('option', { name: optionRegex }).first(),
        overlay.getByRole('listitem').filter({ hasText: optionRegex }).first(),
        overlay.locator('li').filter({ hasText: optionRegex }).first(),
        overlay.locator('button, div, span').filter({ hasText: optionRegex }).first(),
        this.page.getByRole('option', { name: optionRegex }).first(),
        this.page.getByRole('listitem').filter({ hasText: optionRegex }).first(),
      ],
      option,
    );

    if (await searchInput.isVisible().catch(() => false)) await searchInput.fill('');
  }
}


const EPUMP_ORIGIN = new URL(
  (process.env.EPUMP_URL || 'https://stations.epump.africa/login').trim(),
).origin;

const SHUTDOWN_PUMP_URL = `${EPUMP_ORIGIN}/shutdown-pump`;

/**
 * Page Object Model for the Epump Shutdown Pump page.
 * Handles navigation to the page and detection of page surface elements.
 */
export class ShutdownPumpPage {
  readonly page: Page;

  // Locators
  readonly heading: Locator;
  readonly regionSelect: Locator;
  readonly shutdownText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page
      .getByRole('heading', { name: /Shutdown Pump/i })
      .first();
    this.regionSelect = page
      .locator('button, [role="button"], [role="combobox"]')
      .filter({ hasText: /Select Region/i })
      .first();
    this.shutdownText = page
      .getByText(/Shutdown Pump/i)
      .first();
  }

  /** Navigate directly to the shutdown pump URL. */
  async goto(): Promise<void> {
    await this.page.goto(SHUTDOWN_PUMP_URL, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Wait until the shutdown pump page surface is confirmed visible.
   * Polls until the URL contains 'shutdown-pump' and at least one marker is visible.
   */
  async waitForSurface(timeoutMs = 45_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    const markers = [this.heading, this.shutdownText, this.regionSelect];

    while (Date.now() < deadline) {
      const onPage = this.page.url().toLowerCase().includes('shutdown-pump');
      if (onPage) {
        for (const marker of markers) {
          if (await marker.isVisible().catch(() => false)) return true;
        }
      }
      await this.page.waitForTimeout(500);
    }
    return false;
  }

  /** Navigate to the page and confirm the surface is ready. */
  async navigateAndConfirm(timeoutMs = 45_000): Promise<boolean> {
    await this.goto();
    return this.waitForSurface(timeoutMs);
  }

  /** Returns true if the shutdown pump surface is currently visible. */
  async isReady(): Promise<boolean> {
    return (
      this.page.url().toLowerCase().includes('shutdown-pump') &&
      (await this.heading.isVisible().catch(() => false) ||
        await this.regionSelect.isVisible().catch(() => false))
    );
  }
}

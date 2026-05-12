import { expect, type Locator, type Page } from '@playwright/test';

const EPUMP_ORIGIN = new URL(
  (process.env.EPUMP_URL || 'https://stations.epump.africa/login').trim(),
).origin;

function escapeRegex(v: string): string {
  return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function exactTextRegex(v: string): RegExp {
  return new RegExp(`^\\s*${escapeRegex(v)}\\s*$`, 'i');
}

/**
 * Page Object Model for the Epump Pump Calibration page.
 * Encapsulates navigation, form interactions, and the confirmation step.
 */
export class PumpCalibrationPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  /** Click through Pump management → Pump calibration in the sidebar. */
  async navigate(): Promise<void> {
    await this._clickFirst(
      [
        this.page.getByRole('link', { name: /Pump management/i }).first(),
        this.page.getByRole('button', { name: /Pump management/i }).first(),
        this.page.locator('a, button, [role="button"]').filter({ hasText: /Pump management/i }).first(),
      ],
      'Pump management',
    );

    await this.page.waitForTimeout(2_000);

    const calibrationCandidates = [
      this.page.getByRole('link', { name: /Pump calibration/i }).first(),
      this.page.getByRole('button', { name: /Pump calibration/i }).first(),
      this.page.locator('a, button, [role="button"]').filter({ hasText: /Pump calibration/i }).first(),
    ];

    const visible = await this._firstVisible(calibrationCandidates, 10_000);
    if (visible) {
      await this._clickFirst(calibrationCandidates, 'Pump calibration');
    } else {
      // Fallback to href discovery
      const href = await this.page.evaluate(() => {
        const match = Array.from(document.querySelectorAll('a')).find((a) => {
          const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
          return /pump calibration/i.test(text) || /calibr/i.test(a.getAttribute('href') || '');
        });
        return match?.getAttribute('href') || null;
      });

      if (!href) throw new Error('Pump calibration link not found in sidebar or DOM.');
      await this.page.goto(
        href.startsWith('http') ? href : `${EPUMP_ORIGIN}${href}`,
        { waitUntil: 'domcontentloaded' },
      );
    }

    await expect(
      this._firstVisible([
        this.page.getByRole('heading', { name: /Pump calibration/i }).first(),
        this.page.getByText(/Pump calibration/i).first(),
        this.page.getByRole('button', { name: /^Calibrate$/i }).first(),
      ]),
    ).resolves.not.toBeNull();
  }

  /** Open the calibration form drawer. */
  async openCalibrationDrawer(): Promise<void> {
    await this._clickFirst(
      [
        this.page.getByRole('button', { name: /^Calibrate$/i }).first(),
        this.page.locator('button, [role="button"]').filter({ hasText: /^Calibrate$/i }).first(),
      ],
      'open calibration form',
    );

    await expect(
      this._firstVisible([
        this.page.locator('button, [role="button"], [role="combobox"]').filter({ hasText: /Select Region/i }).first(),
        this.page.getByRole('button', { name: /Select Region/i }).first(),
        this.page.locator('button, [role="button"], [role="combobox"]').filter({ hasText: /Select states/i }).first(),
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
  async selectAll(
    label: RegExp,
    fallbackOptions: string[] = [],
    acceptExistingSelection?: RegExp,
  ): Promise<void> {
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

    if (acceptExistingSelection) {
      const existing = await this._firstVisible([
        this.page.locator('button, [role="button"]').filter({ hasText: acceptExistingSelection }).last(),
        this.page.getByRole('button', { name: acceptExistingSelection }).last(),
      ], 3_000);
      if (existing) {
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

    if (!selectAllBtn) throw new Error('Pump selection list opened, but "Select all" was not visible.');
    await selectAllBtn.click().catch(async () => selectAllBtn.click({ force: true }));

    await expect.poll(
      () => this.page.locator('[role="checkbox"][aria-checked="true"], input[type="checkbox"]:checked').count().catch(() => 0),
      { timeout: 15_000 },
    ).toBeGreaterThan(0);

    await this.page.keyboard.press('Escape').catch(() => {});
  }

  /** Set the calibration value (supports numeric input and slider). */
  async setCalibrationValue(targetValue = 0.4): Promise<void> {
    const normalized = Math.min(1, Math.max(0, targetValue));

    const numberField = await this._firstVisible([
      this.page.locator('input[type="number"]').first(),
      this.page.locator('input[placeholder*="calibration" i]').first(),
      this.page.locator('input[placeholder*="value" i]').first(),
    ], 2_000);

    if (numberField) {
      await numberField.fill(String(targetValue));
      await numberField.press('Enter').catch(() => {});
      await this.page.waitForTimeout(750);
      return;
    }

    const sliderHandle = await this._firstVisible([
      this.page.getByRole('slider').first(),
      this.page.locator('[role="slider"]').first(),
      this.page.locator('input[type="range"]').first(),
      this.page.locator('.p-slider-handle').first(),
    ], 8_000);

    if (!sliderHandle) throw new Error('No visible calibration slider found.');

    if ((await sliderHandle.evaluate((el) => el.tagName.toLowerCase())) === 'input') {
      await sliderHandle.evaluate((node, value) => {
        const input = node as HTMLInputElement;
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }, targetValue);
      await this.page.waitForTimeout(750);
      return;
    }

    const track = sliderHandle.locator('xpath=ancestor::*[contains(@class,"slider") or contains(@class,"p-slider")][1]').first();
    const box = (await track.boundingBox()) || (await sliderHandle.boundingBox());
    if (!box) throw new Error('Calibration slider position could not be determined.');

    const targetX = box.x + box.width * normalized;
    const targetY = box.y + box.height / 2;
    await this.page.mouse.move(box.x + box.width / 2, targetY);
    await this.page.mouse.down();
    await this.page.mouse.move(targetX, targetY, { steps: 8 });
    await this.page.mouse.up();
    await this.page.waitForTimeout(750);
  }

  /** The password field inside the confirmation modal. */
  get confirmationPasswordField(): Locator {
    return this.page.locator('input[type="password"]').last();
  }

  /** Fill the confirmation password. */
  async fillConfirmationPassword(password: string): Promise<void> {
    await this.confirmationPasswordField.waitFor({ state: 'visible', timeout: 15_000 });
    await this.confirmationPasswordField.fill(password);
  }

  /** Click the final confirm/submit button to send the calibration. */
  async submitConfirmation(): Promise<void> {
    await this._clickFirst(
      [
        this.page.getByRole('button', { name: /Confirm|Calibrate|Proceed|Submit/i }).last(),
        this.page.locator('button, [role="button"]').filter({ hasText: /Confirm|Calibrate|Proceed|Submit/i }).last(),
      ],
      'password confirmation',
    );
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

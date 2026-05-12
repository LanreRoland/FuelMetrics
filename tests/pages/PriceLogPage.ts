import { type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for the Epump Price Log page.
 * Encapsulates the price update form: product, price, region, state, and outlet selection.
 */
export class PriceLogPage {
  readonly page: Page;

  // Locators
  readonly updatePriceButton: Locator;
  readonly priceInput: Locator;
  readonly submitButton: Locator;
  readonly authPasswordField: Locator;
  readonly confirmButton: Locator;
  readonly priceTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.updatePriceButton = page
      .getByRole('button', { name: /Update Price/i })
      .first();
    this.priceInput = page.locator('input[placeholder="Enter New Price"]');
    this.submitButton = page.getByRole('button', { name: /Request price change/i });
    this.authPasswordField = page.locator('input[placeholder="Password"]');
    this.confirmButton = page.getByRole('button', { name: /Confirm Price Update/i });
    this.priceTable = page.locator('.p-datatable-tbody');
  }

  /** Click "Update Price" to open the price update drawer. */
  async openUpdatePriceDrawer(): Promise<void> {
    await this.updatePriceButton.waitFor({ state: 'visible', timeout: 60_000 });
    await this.updatePriceButton.click();
  }

  /** Select a product (e.g. "PMS") from the product dropdown. */
  async selectProduct(product: string): Promise<void> {
    await this.page.locator('button:has-text("Select product")').first().click();
    const option = this.page
      .getByRole('listitem')
      .filter({ hasText: new RegExp(`^${product}$`) })
      .first();
    await option.waitFor({ state: 'visible' });
    await option.click();
  }

  /** Enter the new price value in the price input field. */
  async enterPrice(price: string): Promise<void> {
    await this.priceInput.fill(price);
  }

  /** Select a region (e.g. "West") from the region dropdown. */
  async selectRegion(region: string): Promise<void> {
    await this.page.locator('button:has-text("Select Region")').click();
    const option = this.page
      .getByRole('listitem')
      .filter({ hasText: new RegExp(`^${region}$`) })
      .first();
    await option.waitFor({ state: 'visible' });
    await option.click();
  }

  /** Search for and select a state (e.g. "Lagos") from the states dropdown. */
  async selectState(state: string): Promise<void> {
    await this.page.locator('button:has-text("Select states")').click();
    const searchInput = this.page.locator('input[placeholder="Search"]').last();
    await searchInput.waitFor({ state: 'visible' });
    await searchInput.fill(state);
    const option = this.page
      .getByRole('listitem')
      .filter({ hasText: new RegExp(`^${state}$`) })
      .first();
    await option.waitFor({ state: 'visible', timeout: 30_000 });
    await option.click();
  }

  /** Open the retail outlets dropdown and select all outlets. */
  async selectAllRetailOutlets(): Promise<void> {
    await this.page.locator('button:has-text("Select retail Outlets")').click();
    const selectAllBtn = this.page.locator('button:has-text("Select all")').last();
    await selectAllBtn.waitFor({ state: 'visible', timeout: 30_000 });
    await selectAllBtn.click();
  }

  /** Submit the price change request form. */
  async submitPriceChange(): Promise<void> {
    await this.submitButton.waitFor({ state: 'visible', timeout: 30_000 });
    await this.submitButton.click();
  }

  /** Authorize the price change with a password then click confirm. */
  async authorizeAndConfirm(password: string): Promise<void> {
    await this.authPasswordField.waitFor({ state: 'visible' });
    await this.authPasswordField.fill(password);
    await this.confirmButton.waitFor({ state: 'visible' });
    await this.confirmButton.click();
  }
}

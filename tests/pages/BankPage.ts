import { type Locator, type Page } from '@playwright/test';
import { waitForVisible } from '../helpers/epump';

/**
 * Page Object Model for the Epump Bank Validation page.
 * Handles company search, navigation to the Bank section, and bank list validation.
 */
export class BankPage {
  readonly page: Page;

  // Locators
  readonly companySearchBox: Locator;
  readonly addBankButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.companySearchBox = page.locator('input[placeholder="Search"]').first();
    this.addBankButton = page.getByRole('button', { name: /Add Bank/i }).first();
  }

  /** Locator for a company row matching a name and station count. */
  companyRow(name: string, stationCount: string): Locator {
    return this.page
      .locator('tr')
      .filter({ hasText: new RegExp(name, 'i') })
      .filter({ hasText: stationCount })
      .first();
  }

  /** Locator for a bank option in any visible list/dropdown. */
  bankOption(bankNameRegex: RegExp): Locator {
    return this.page
      .locator('[role="option"], li, .ant-select-item-option, .select__option, [id*="option"]')
      .filter({ hasText: bankNameRegex })
      .first();
  }

  /** Search for a company by name and press Enter. */
  async searchCompany(name: string): Promise<void> {
    await this.companySearchBox.fill(name);
    await this.page.keyboard.press('Enter');
  }

  /**
   * Open the Details page for the target company row.
   * Tries a "Details" link first, then falls back to any link in the row.
   */
  async openCompanyDetails(name: string, stationCount: string): Promise<boolean> {
    const row = this.companyRow(name, stationCount);
    if (!(await waitForVisible(row, 30_000))) return false;

    const detailsLink = row.locator('a, button').filter({ hasText: /Details/i }).first();
    if (await waitForVisible(detailsLink, 15_000)) {
      await detailsLink.click();
      return true;
    }

    const anyLink = row.locator('a').first();
    if (await waitForVisible(anyLink, 15_000)) {
      await anyLink.click();
      return true;
    }

    return false;
  }

  /**
   * Click the Bank link on the sidebar.
   * Tries multiple candidate selectors in order.
   */
  async navigateToBankSection(): Promise<boolean> {
    const candidates: Locator[] = [
      this.page.getByRole('link', { name: /^Bank$/i }).first(),
      this.page.getByRole('link', { name: /Bank/i }).first(),
      this.page.locator('a, button, [role="button"]').filter({ hasText: /^Bank$/i }).first(),
    ];

    for (const candidate of candidates) {
      if (await waitForVisible(candidate, 10_000)) {
        await candidate.click();
        return true;
      }
    }
    return false;
  }

  /**
   * Open the "Add Bank" modal.
   * Returns the bank search input that becomes available after opening.
   */
  async openAddBankModal(): Promise<Locator | null> {
    if (!(await waitForVisible(this.addBankButton, 60_000))) return null;
    await this.addBankButton.click();

    const searchCandidates: Locator[] = [
      this.page.locator('input[placeholder*="bank" i], input[placeholder*="search" i], input[placeholder*="select" i]').first(),
      this.page.locator('input[aria-autocomplete], [role="combobox"] input').first(),
      this.page.getByRole('combobox').first(),
    ];
    const triggerCandidates: Locator[] = [
      this.page.getByRole('button', { name: /Select\s*Bank|Bank/i }).first(),
      this.page.locator('[role="combobox"], [aria-haspopup="listbox"], .ant-select-selector, .select__control').first(),
    ];

    for (const candidate of searchCandidates) {
      if (await waitForVisible(candidate, 5_000)) return candidate;
    }

    for (const trigger of triggerCandidates) {
      if (await waitForVisible(trigger, 5_000)) {
        await trigger.click();
        for (const candidate of searchCandidates) {
          if (await waitForVisible(candidate, 5_000)) return candidate;
        }
      }
    }

    return null;
  }

  /**
   * Search for a bank by name using the given search input and assert
   * the bank option appears in the dropdown.
   */
  async assertBankAvailable(
    searchInput: Locator,
    searchText: string,
    bankNameRegex: RegExp,
  ): Promise<boolean> {
    await searchInput.click();
    await searchInput.fill('');
    await searchInput.fill(searchText);

    const option = this.bankOption(bankNameRegex);
    const fallback = this.page.getByText(bankNameRegex).first();

    try {
      await option.or(fallback).waitFor({ state: 'visible', timeout: 15_000 });
      return true;
    } catch {
      return false;
    }
  }
}

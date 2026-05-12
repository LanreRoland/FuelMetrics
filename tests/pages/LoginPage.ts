import { type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for the Epump Login Page.
 * Encapsulates all locators and login actions.
 */
export class LoginPage {
  readonly page: Page;

  // Locators
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page
      .locator('input[type="email"], input[name*="email" i], input[name*="username" i], [placeholder*="email" i]')
      .first();
    this.passwordInput = page
      .locator('input[type="password"], input[name*="password" i], [placeholder*="password" i]')
      .first();
    this.signInButton = page
      .getByRole('button', { name: /Sign in|Sign-in|Login|loading/i })
      .first();
  }

  /** Navigate to the login page and wait for the email field to be ready. */
  async goto(): Promise<void> {
    const url = (process.env.EPUMP_URL || 'https://stations.epump.africa/login').trim();
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    await this.emailInput.waitFor({ state: 'visible', timeout: 30_000 });
  }

  /** Fill credentials and submit the login form. */
  async login(email: string, password: string): Promise<void> {
    await this.emailInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.emailInput.clear();
    await this.emailInput.fill(email);
    await this.passwordInput.clear();
    await this.passwordInput.fill(password);
    await this.signInButton.waitFor({ state: 'visible', timeout: 5_000 });
    await this.signInButton.click();
  }

  /** Returns true if the login form is currently visible. */
  async isVisible(): Promise<boolean> {
    return this.emailInput.isVisible().catch(() => false);
  }
}

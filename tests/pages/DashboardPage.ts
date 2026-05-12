import { type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for the Epump Dashboard.
 * Encapsulates navigation links, widget locators, and audit helpers.
 */
export class DashboardPage {
  readonly page: Page;

  // Locators
  readonly priceManagementLink: Locator;
  readonly dashboardLink: Locator;
  readonly stationInfoWidget: Locator;
  readonly stationInfoText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.priceManagementLink = page
      .getByRole('link', { name: /Price management/i })
      .first();
    this.dashboardLink = page
      .getByRole('link', { name: /Dashboard/i })
      .first();
    this.stationInfoWidget = page
      .locator('section, article, .card, .widget, .panel, .p-card, div')
      .filter({ hasText: /Station information|NUMBER OF STATION|DISCONNECTED PUMP|PUMP IN STATION/i })
      .first();
    this.stationInfoText = page
      .getByText(/Station information|NUMBER OF STATION/i)
      .first();
  }

  /** Wait for the dashboard URL and core nav to be present. */
  async waitForLoad(timeout = 30_000): Promise<void> {
    await this.page.waitForURL(/dashboard/i, { timeout });
    await this.priceManagementLink.waitFor({ state: 'visible', timeout });
  }

  /**
   * Extract the station count value from the dashboard widget.
   * Returns null if the widget is not found.
   */
  async getStationCount(): Promise<string | null> {
    return this.page.evaluate(() => {
      const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
      const extractCount = (value: string) => {
        const match = normalize(value).match(/NUMBER OF STATION\D*?([\d,]+)/i);
        return match ? match[1].replace(/,/g, '') : null;
      };

      const bodyCount = extractCount(document.body.innerText || '');
      if (bodyCount) return bodyCount;

      for (const element of Array.from(document.querySelectorAll('body *'))) {
        const text = normalize((element as HTMLElement).innerText || element.textContent || '');
        if (!/NUMBER OF STATION/i.test(text)) continue;

        const container = element.closest('section, article, div') as HTMLElement | null;
        const candidates = [
          text,
          normalize(element.parentElement?.innerText || element.parentElement?.textContent || ''),
          normalize(container?.innerText || container?.textContent || ''),
        ];

        for (const candidate of candidates) {
          const count = extractCount(candidate);
          if (count) return count;
        }
      }
      return null;
    });
  }

  /** Returns all broken image src/alt values found on the page. */
  async getBrokenImages(): Promise<string[]> {
    return this.page.evaluate(() =>
      Array.from(document.querySelectorAll('img'))
        .filter(img => !img.complete || img.naturalWidth === 0)
        .map(img => img.src || img.alt || 'unknown'),
    );
  }

  /** Returns unique text content of DOM nodes matching common error keywords. */
  async getErrorTextNodes(): Promise<string[]> {
    return this.page.evaluate(() => {
      const matches: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        const content = node.textContent;
        if (content && /error|failed|undefined|NaN|null/i.test(content)) {
          matches.push(content.trim());
        }
      }
      return matches;
    });
  }

  /** Take a full-page screenshot to the given file path. */
  async takeFullPageScreenshot(path: string): Promise<void> {
    await this.page.screenshot({ path, fullPage: true });
  }
}

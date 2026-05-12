import { type Locator, type Page } from '@playwright/test';

/**
 * Page Object Model for the Epump Chat Support Widget.
 * Encapsulates the logic for finding and interacting with the floating chat launcher,
 * whether it is rendered inside an iframe or directly in the DOM.
 */
export class ChatSupportPage {
  readonly page: Page;

  private readonly iframeSelectors = [
    'iframe[title*="chat" i]',
    'iframe[title*="widget" i]',
    'iframe[id*="intercom" i]',
    'iframe[src*="tawk" i]',
    'iframe[src*="crisp" i]',
    '.zsiq_floatmain iframe',
  ];

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Attempt to locate the chat launcher button.
   * Checks iframe contents first, then DOM-level candidates, then fixed elements.
   * Returns the launcher locator if found, or null.
   */
  async findLauncher(): Promise<Locator | null> {
    // 1. Search inside known iframe candidates
    for (const selector of this.iframeSelectors) {
      const frames = this.page.locator(selector);
      const count = await frames.count();

      for (let i = 0; i < count; i++) {
        const frameHandle = await frames.nth(i).contentFrame();
        if (!frameHandle) continue;

        const clickable = frameHandle.locator('button, [role="button"], a, svg').first();
        if (await clickable.isVisible().catch(() => false)) {
          console.log(`[ info ] Chat launcher found in iframe: ${selector} (index ${i})`);
          return clickable;
        }
      }
    }

    // 2. Check common DOM-level chat elements
    const domLauncher = this.page.locator(
      '[aria-label*="chat" i], [aria-label*="support" i], [id*="chat-widget"], #chat-button, .chat-launcher',
    ).first();

    if ((await domLauncher.count()) > 0 && (await domLauncher.isVisible().catch(() => false))) {
      console.log('[ info ] Chat launcher found in main DOM.');
      return domLauncher;
    }

    // 3. Advanced fallback: evaluate fixed bottom-right elements
    const fixedSelector = await this.page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const btn = elements.find((el) => {
        if (['SCRIPT', 'STYLE', 'LINK'].includes(el.tagName)) return false;
        const style = window.getComputedStyle(el);
        const isFixed = style.position === 'fixed' || style.position === 'absolute';
        const isBottomRight =
          parseInt(style.bottom) >= 0 &&
          parseInt(style.bottom) < 100 &&
          parseInt(style.right) >= 0 &&
          parseInt(style.right) < 100;
        const isVisible =
          style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        const isClickableSize =
          (el as HTMLElement).offsetHeight > 20 && (el as HTMLElement).offsetWidth > 20;
        return isFixed && isBottomRight && isVisible && isClickableSize && parseInt(style.zIndex) > 10;
      });
      return btn ? (btn.id ? `#${btn.id}` : btn.className ? `.${btn.className.split(' ')[0]}` : null) : null;
    });

    if (fixedSelector) {
      const fixedLocator = this.page.locator(fixedSelector).first();
      if (await fixedLocator.isVisible().catch(() => false)) {
        console.log(`[ info ] Chat launcher found via fixed-element evaluation: ${fixedSelector}`);
        return fixedLocator;
      }
    }

    return null;
  }

  /**
   * Click the chat launcher and verify a chat window or frame opens.
   * Returns true if the chat opened, false otherwise.
   */
  async openChat(launcher: Locator): Promise<boolean> {
    await launcher.click();
    await this.page.waitForTimeout(3000);

    // Check for an open chat iframe/window
    for (const selector of this.iframeSelectors) {
      const frame = this.page.locator(selector).first();
      if (await frame.isVisible().catch(() => false)) {
        const handle = await frame.contentFrame();
        if (handle) {
          const content = handle.locator('body');
          const text = await content.textContent().catch(() => '');
          if (text && text.trim().length > 0) return true;
        }
      }
    }

    // Fallback: check for a visible chat container in the DOM
    const chatWindow = this.page.locator(
      '[id*="chat-window"], [class*="chat-open"], [aria-label*="chat" i]',
    ).first();
    return chatWindow.isVisible().catch(() => false);
  }
}

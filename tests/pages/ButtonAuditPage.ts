import { type Locator, type Page } from '@playwright/test';

const AUDIT_ATTR = 'data-button-audit-id';

export type AuditTarget = { id: string; label: string };
export type AuditResult = { name: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail?: string };

const KNOWN_BASELINE_ERROR_PATTERNS = [
  /attribute.*NaN/i,
  /Expected length,\s*"NaN"/i,
  /translate\(NaN,\s*0\)/i,
  /ERR_BLOCKED_BY_RESPONSE\.NotSameOrigin/i,
  /^(?:\[Console Error\]\s*)?true$/i,
];

const NON_ACTIONABLE_CLICK_PATTERNS = [
  /element is not attached/i,
  /element is not visible/i,
  /outside of the viewport/i,
  /another element .* intercepts pointer events/i,
  /subtree intercepts pointer events/i,
  /page has navigated away/i,
  /target closed/i,
  /timeout .*click/i,
  /click.*timeout/i,
  /locator\.click:\s*timeout \d+ms exceeded/i,
  /timeout \d+ms exceeded/i,
  /not enabled/i,
  /no node found for selector/i,
];

/**
 * Page Object Model for the Epump Dashboard Button Click Audit.
 * Encapsulates target discovery, auditing logic, and dashboard restoration.
 */
export class ButtonAuditPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Mark all visible clickable elements in the main content area with a
   * data attribute and return their descriptions.
   */
  async markAuditTargets(): Promise<AuditTarget[]> {
    return this.page.evaluate(({ auditAttr }) => {
      const selector = 'button, a, [role="button"], .clickable, .btn';
      const excludedAncestorSelector = [
        'nav', 'aside', '[role="navigation"]', 'section.fixed', '.header',
        '.sticky', '.sidebar', '.side-bar', '.sidenav', '.drawer', '.menu',
        '.ant-menu', '[class*="sidebar"]', '[class*="sidenav"]', '[class*="drawer"]',
      ].join(', ');

      const leftRailBoundary = Math.max(260, Math.min(window.innerWidth * 0.25, 340));

      const isVisible = (element: HTMLElement) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const isDockedToLeftRail = centerX < leftRailBoundary;
        const isFloatingWidget =
          ['fixed', 'sticky'].includes(style.position) ||
          (centerX > window.innerWidth - 180 && rect.top > window.innerHeight - 220);

        return (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0 &&
          !isDockedToLeftRail &&
          !isFloatingWidget
        );
      };

      document.querySelectorAll(`[${auditAttr}]`).forEach((el) => el.removeAttribute(auditAttr));

      const targets: Array<{ id: string; label: string }> = [];
      let index = 0;

      for (const node of Array.from(document.querySelectorAll(selector))) {
        const element = node as HTMLElement;
        if (!isVisible(element) || element.closest(excludedAncestorSelector)) continue;

        const normalize = (v: string) => v.replace(/\s+/g, ' ').trim();
        const text = normalize(element.innerText || element.textContent || '');
        const label =
          text ||
          normalize(element.getAttribute('aria-label') || '') ||
          normalize(element.getAttribute('title') || '') ||
          normalize(element.getAttribute('href') || '') ||
          `Element #${index}`;

        element.setAttribute(auditAttr, String(index));
        targets.push({ id: String(index), label });
        index++;
      }

      return targets;
    }, { auditAttr: AUDIT_ATTR });
  }

  /** Return a locator for an element by its audit index. */
  auditElement(id: string): Locator {
    return this.page.locator(`[${AUDIT_ATTR}="${id}"]`).first();
  }

  /** Restore the dashboard if navigation has moved away from it. */
  async restoreDashboard(dashboardUrl: string): Promise<void> {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (this.page.url() !== dashboardUrl) {
        await this.page.goto(dashboardUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
      }

      const ready = await this.page
        .locator('section, article, .card, .widget, .panel, .p-card, div')
        .filter({ hasText: /Station information|NUMBER OF STATION|DISCONNECTED PUMP|PUMP IN STATION/i })
        .first()
        .isVisible()
        .catch(() => false);

      if (ready) return;
    }
  }

  /** Returns true if the error message is a known non-actionable click side-effect. */
  isNonActionableClickError(message: string): boolean {
    return NON_ACTIONABLE_CLICK_PATTERNS.some((p) => p.test(message));
  }

  /** Returns true if the console error is an expected baseline error (not a regression). */
  isKnownBaselineConsoleError(message: string): boolean {
    return KNOWN_BASELINE_ERROR_PATTERNS.some((p) => p.test(message));
  }
}

import { test, expect } from '@playwright/test';

test.describe('Dashboard Functionality Audit', () => {
  test.setTimeout(120000); // 2 minutes for a deep audit

  test('should audit dashboard widgets and non-functional elements', async ({ page }) => {
    // 1. Open and Login
    await page.goto('https://stations.epump.africa/', { waitUntil: 'networkidle', timeout: 60000 });

    const emailLocator = page.locator('input[type="email"], [placeholder*="email" i]').first();
    const isLoginPage = await emailLocator.isVisible({ timeout: 5000 }).catch(() => false);

    if (isLoginPage) {
      await emailLocator.fill('mikeandmike@mailinator.com');
      await page.locator('input[type="password"]').first().fill('Tester.1');
      await page.getByRole('button', { name: /Sign in|Sign-in|Login/i }).first().click();
      await page.waitForURL(/.*dashboard.*/i, { timeout: 30000 }).catch(() => {});
      await page.waitForLoadState('networkidle');
    }

    // 2. Monitoring console for errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(`${msg.text()}`);
      }
    });

    await page.waitForTimeout(10000); // Give complex widgets time to render

    // 3. Screen capture
    await page.screenshot({ path: 'dashboard-audit-full.png', fullPage: true });

    // 4. Audit Findings
    const findings: string[] = [];

    // Check captured console errors
    if (consoleErrors.length > 0) {
        const uniqueErrors = [...new Set(consoleErrors)];
        findings.push(`Console errors detected: ${uniqueErrors.slice(0, 5).join('; ')}`);
        if (uniqueErrors.some(e => e.includes('NaN'))) {
            findings.push('CRITICAL: NaN rendering errors found in console (likely broken charts/SVGs).');
        }
    }

    // Check for empty charts or widget placeholders
    const containers = page.locator('.card, .widget, .panel, .p-card');
    const containerCount = await containers.count();
    for (let i = 0; i < containerCount; i++) {
        const container = containers.nth(i);
        const text = await container.innerText();
        if (text.trim().length < 5) { // Very short text might mean it failed to load
            findings.push(`Widget at index ${i} appears nearly empty or failed to load data.`);
        }
    }

    // Check for broken images in the main area
    const brokenImages = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('img'))
            .filter(img => !img.complete || img.naturalWidth === 0)
            .map(img => img.src || img.alt || 'unknown');
    });
    if (brokenImages.length > 0) {
        findings.push(`Found ${brokenImages.length} broken images.`);
    }

    // Check for common error indicators in the DOM
    const errorIndicators = await page.evaluate(() => {
        const matches: string[] = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let node;
        while(node = walker.nextNode()) {
            const content = node.textContent;
            if (content && /error|failed|undefined|NaN|null/i.test(content)) {
                matches.push(content.trim());
            }
        }
        return matches;
    });
    if (errorIndicators.length > 0) {
        findings.push(`Found ${errorIndicators.length} error strings in UI: ${errorIndicators.slice(0, 3).join(', ')}`);
    }

    console.log('--- DASHBOARD AUDIT RESULTS ---');
    findings.forEach(f => console.log(`[ find ] ${f}`));
    if (findings.length === 0) {
        console.log('[ info ] No obvious breakages found in the main content area.');
    }
    console.log('-------------------------------');

    // Always check for sidebar to confirm we are logged in
    await expect(page.getByRole('link', { name: 'Price management' }).first()).toBeVisible();
  });
});

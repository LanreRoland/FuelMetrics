import { test, expect } from '@playwright/test';
import { ensureAuthenticated, priceManagementLink } from './helpers/epump';

/**
 * 07-ButtonClickAudit.spec.ts
 * 
 * This test identifies all clickable elements (buttons, links, etc.) on the dashboard
 * and attempts to click each one to verify if it "breaks" (causes console errors, 
 * navigation failures, or UI crashes).
 */

test.describe('Dashboard Button Click Audit', () => {
    test.setTimeout(300000); // 5 minutes for a thorough audit

    test('should click every clickable element on the dashboard and report status', async ({ page }) => {
        // 1. Authentication
        const auth = await ensureAuthenticated(page);
        if (!auth.ok) {
            console.error(`[ error ] Authentication failed: ${auth.reason}`);
            await page.screenshot({ path: 'auth-failure.png' });
            test.skip(true, auth.reason);
        }

        console.log('[ info ] Navigating to Dashboard and waiting for stability...');
        await page.waitForTimeout(5000); // Wait for animations/charts

        // 2. Monitoring console for errors
        const consoleErrors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(`[Console Error] ${msg.text()}`);
            }
        });

        // 3. Discovery: Find all elements that look clickable
        // We focus on the main content area (excluding the sidebar)
        // Common selectors for clickable elements in this app
        const clickableSelector = 'button, a, [role="button"], .clickable, .btn';
        
        // Let's refine the search to elements NOT in the sidebar/navigation
        // Usually sidebars are <nav>, <aside>, or have certain classes.
        // If we don't know the sidebar selector, we can try to filter by container.
        const dashboardElements = page.locator(clickableSelector).filter({
            hasNot: page.locator('nav *'), // Exclude sidebar/nav links
        }).filter({
            hasNot: page.locator('aside *'),
        });

        const count = await dashboardElements.count();
        console.log(`[ info ] Found ${count} potentially clickable elements in the main area.`);

        const results: { name: string, status: 'PASS' | 'FAIL', detail?: string }[] = [];

        // 4. Iterate and Click
        for (let i = 0; i < count; i++) {
            const element = dashboardElements.nth(i);
            
            // Get some identifying info
            const text = await element.innerText().catch(() => '');
            const id = await element.getAttribute('id').catch(() => '');
            const title = await element.getAttribute('title').catch(() => '');
            const label = text.trim() || id || title || `Element #${i}`;

            console.log(`[ click ] [${i+1}/${count}] Clicking: "${label}"`);

            try {
                // Pre-click state
                const initialUrl = page.url();
                
                // Click (with a timeout and force if needed)
                await element.click({ timeout: 5000 }).catch(async (e) => {
                    // If regular click fails (maybe covered?), try simple click
                    console.warn(`[ warn ] Regular click failed for "${label}", trying force click...`);
                    await element.click({ force: true, timeout: 5000 });
                });

                await page.waitForTimeout(1000); // Observe effect

                // Check for errors
                let status: 'PASS' | 'FAIL' = 'PASS';
                let detail = '';

                if (consoleErrors.length > 0) {
                    status = 'FAIL';
                    detail = consoleErrors.shift() || 'Unknown console error';
                }

                // If it navigated away, go back to dashboard
                if (page.url() !== initialUrl && !page.url().includes('dashboard')) {
                    console.log(`[ info ] Navigated away to ${page.url()}. Going back...`);
                    await page.goBack();
                    await page.waitForTimeout(2000);
                }

                results.push({ name: label, status, detail });

            } catch (err: any) {
                console.error(`[ error ] Failed to interact with "${label}": ${err.message}`);
                results.push({ name: label, status: 'FAIL', detail: err.message });
            }
        }

        // 5. Final Reporting
        console.log('\n--- BUTTON CLICK AUDIT RESULTS ---');
        let passCount = 0;
        let failCount = 0;

        results.forEach((res, idx) => {
            const icon = res.status === 'PASS' ? '✅' : '❌';
            console.log(`${icon} [${res.status}] ${res.name} ${res.detail ? `(${res.detail})` : ''}`);
            if (res.status === 'PASS') passCount++;
            else failCount++;
        });

        console.log('----------------------------------');
        console.log(`Summary: ${passCount} Passed, ${failCount} Failed.`);
        console.log('----------------------------------');

        // Capture a final screenshot
        await page.screenshot({ path: 'button-audit-final.png', fullPage: true });

        expect(failCount).toBe(0); // Optional: fail the test if any button breaks
    });
});

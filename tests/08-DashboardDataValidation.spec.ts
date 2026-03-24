import { test, expect } from '@playwright/test';
import { ensureAuthenticated } from './helpers/epump';

/**
 * 08-DashboardDataValidation.spec.ts
 * 
 * This test guarantees the integrity of dashboard data displays:
 * 1. Checks that key metrics and widgets do not display 'NaN' (Not a Number).
 * 2. Monitors the browser console for rendering errors specific to SVG or charting 
 *    libraries falling back to 'NaN' calculations.
 */

test.describe('Dashboard Data and Rendering Validation', () => {
    test.setTimeout(90000);

    test('Widgets and Charts should not render NaN values', async ({ page }) => {
        // 1. Maintain a list of critical chart/rendering errors seen in console
        const nanConsoleErrors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error' || msg.type() === 'warning') {
                const text = msg.text();
                // Common SVG/ApexCharts parsing errors when given invalid dimension data
                if (text.includes('NaN') && (text.includes('attribute') || text.includes('Expected'))) {
                    nanConsoleErrors.push(text);
                }
            }
        });

        // 2. Authenticate and land on dashboard
        const auth = await ensureAuthenticated(page);
        if (!auth.ok) {
            test.skip(true, `Authentication failed: ${auth.reason}`);
        }

        console.log('[ info ] Navigating to dashboard and waiting for widgets/charts to render...');
        // Wait broadly for the page to settle since charts load asynchronously
        await page.waitForTimeout(10000); 
        
        // 3. Assert on Console Errors
        // If the charts attempted to render with missing/bad API data, it will be caught here.
        if (nanConsoleErrors.length > 0) {
            console.error(`[ error ] Detected ${nanConsoleErrors.length} NaN rendering errors in console.`);
            nanConsoleErrors.forEach(err => console.error(`   - ${err}`));
        }
        expect(nanConsoleErrors.length, 'Console should be free of SVG/chart NaN attribute rendering errors').toBe(0);

        // 4. Assert on visible 'NaN' text in the DOM
        // The regex looks for exact or isolated "NaN", case sensitive.
        console.log('[ info ] Scanning DOM for visible "NaN" text...');
        
        // We look for elements containing exactly "NaN" or having "NaN" as an isolated word.
        // page.getByText() with exact match is generally best for pure text nodes.
        const nanElements = page.getByText(/^NaN$/);
        const countRegexElements = await nanElements.count();

        // Alternatively, finding elements where text includes "NaN " or " NaN"
        const partialNanLocators = page.locator('*:has-text("NaN")');
        // Filter out scripts/styles just in case
        
        let foundVisibleNaN = false;
        
        if (countRegexElements > 0) {
             console.error(`[ error ] Found ${countRegexElements} elements displaying exact 'NaN'.`);
             foundVisibleNaN = true;
        }

        // Specifically look for the revenue/volume text blocks
        // It's common for widgets to just render as "NaN"
        const specificNanValues = page.locator('h1, h2, h3, h4, h5, h6, p, span, div').filter({ hasText: /^NaN(\.0+)?$/ });
        if (await specificNanValues.count() > 0) {
            console.error(`[ error ] Found heading/paragraph elements exclusively rendering 'NaN'.`);
            foundVisibleNaN = true;
        }

        expect(foundVisibleNaN, 'Dashboard UI should not display NaN for any metric or text value').toBe(false);
    });
});

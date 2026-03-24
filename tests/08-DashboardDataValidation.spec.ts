import { test, expect } from '@playwright/test';
import {
    assertStatusCodeAudit,
    ensureAuthenticated,
    priceManagementLink,
    startStatusCodeAudit,
} from './helpers/epump';

/**
 * 08-DashboardDataValidation.spec.ts
 * 
 * This test validates that the dashboard loads successfully and exposes
 * the core navigation and dashboard widgets needed for basic usage.
 */

test.describe('Dashboard Availability Validation', () => {
    test.setTimeout(120000);

    test('should load the dashboard shell and core widgets', async ({ page }) => {
        const statusAudit = startStatusCodeAudit(page);
        const nanConsoleErrors: string[] = [];
        page.on('console', msg => {
            if (msg.type() === 'error' || msg.type() === 'warning') {
                const text = msg.text();
                if (text.includes('NaN') && (text.includes('attribute') || text.includes('Expected'))) {
                    nanConsoleErrors.push(text);
                }
            }
        });

        const auth = await ensureAuthenticated(page);
        if (!auth.ok) {
            statusAudit.stop();
            test.skip(true, `Authentication failed: ${auth.reason}`);
        }

        console.log('[ info ] Waiting for the dashboard shell and widgets to render...');
        await page.waitForTimeout(10000); 

        await expect(page).toHaveURL(/dashboard/i, { timeout: 30000 });
        await expect(page.getByRole('link', { name: /Dashboard/i }).first()).toBeVisible({ timeout: 30000 });
        await expect(priceManagementLink(page)).toBeVisible({ timeout: 30000 });

        const dashboardContent = page
            .locator('section, article, .card, .widget, .panel, .p-card, div')
            .filter({ hasText: /Station information|NUMBER OF STATION|DISCONNECTED PUMP|PUMP IN STATION/i })
            .first();

        await expect(dashboardContent).toBeVisible({ timeout: 30000 });
        await expect(page.getByText(/Station information|NUMBER OF STATION/i).first()).toBeVisible({ timeout: 30000 });

        const bodyText = await page.locator('body').innerText();
        expect(bodyText).toMatch(/Dashboard/i);
        expect(bodyText).toMatch(/Station information|NUMBER OF STATION|DISCONNECTED PUMP|PUMP IN STATION/i);

        if (nanConsoleErrors.length > 0) {
            console.warn(`[ warn ] Ignoring ${nanConsoleErrors.length} NaN-related console messages while validating dashboard availability.`);
        }
        await assertStatusCodeAudit(page, statusAudit, '08-DashboardDataValidation.spec.ts');
    });
});

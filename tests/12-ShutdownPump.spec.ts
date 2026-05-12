import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  emailInput,
  openPortal,
  passwordInput,
  portalUnavailableReason,
  signInButton,
  startStatusCodeAudit,
} from './helpers/epump';
import { ShutdownPumpPage } from './pages/ShutdownPumpPage';

const EPUMP_EMAIL = process.env.EPUMP_EMAIL || 'mikeandmike@mailinator.com';
const EPUMP_PASSWORD = process.env.EPUMP_PASSWORD || 'Tester.1';
const FINAL_ACTION_SETTLE_MS = 5_000;
const ACCESS_DENIED_TEXT = /Your account does not have access to this Data/i;

test.describe('Pump Shutdown Automation', () => {
  test.setTimeout(420_000);

  test('should validate each shutdown pump action without executing the shutdown', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const shutdownPage = new ShutdownPumpPage(page);

    // Authenticate and navigate directly to shutdown pump
    let authenticated = false;
    for (let attempt = 1; attempt <= 3; attempt++) {
      const sessionSurface = await openPortal(page);
      if (sessionSurface === 'dashboard') {
        if (await shutdownPage.navigateAndConfirm()) {
          authenticated = true;
          break;
        }
      } else if (sessionSurface === 'login') {
        await emailInput(page).fill(EPUMP_EMAIL);
        await passwordInput(page).fill(EPUMP_PASSWORD);
        await signInButton(page).click();
        await page.waitForTimeout(5_000);
        if (await shutdownPage.navigateAndConfirm()) {
          authenticated = true;
          break;
        }
      } else {
        const reason = await portalUnavailableReason(page);
        console.warn(`[ warn ] Portal unavailable: ${reason}`);
      }

      if (attempt < 3) {
        await page.goto('https://stations.epump.africa/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForTimeout(5_000);
      }
    }

    if (!authenticated) {
      statusAudit.stop();
      test.skip(true, 'Could not authenticate and reach Shutdown Pump.');
    }

    await test.step('open shutdown pump page', async () => {
      await expect(shutdownPage.waitForSurface(10_000)).resolves.toBe(true);
      await page.screenshot({ path: 'shutdown-pump-access-check.png', fullPage: true }).catch(() => {});

      const pageText = await page.locator('body').textContent().catch(() => '');
      if (pageText && ACCESS_DENIED_TEXT.test(pageText)) {
        throw new Error('Account does not have permission to access the shutdown pump feature.');
      }
    });

    await test.step('open shutdown drawer', async () => {
      await shutdownPage.openShutdownDrawer();
    });

    await test.step('select region and state', async () => {
      await shutdownPage.selectMultipleOptions(/Select Region/i, ['West']);
      await shutdownPage.selectMultipleOptions(/Select states/i, ['Lagos']);
    });

    await test.step('select outlets and pumps', async () => {
      await shutdownPage.selectAll(/Select retail outlets/i, ['Outlet Demo', 'Outlet demo 4', 'Demo 2']);
      await shutdownPage.selectAllPumps();
    });

    await test.step('fill shutdown reason', async () => {
      await shutdownPage.fillShutdownReason('No reason');
    });

    await test.step('open confirmation modal (no execution)', async () => {
      const shutdownButton = page.getByRole('button', { name: /^Shutdown$/i }).first();
      await expect(shutdownButton).toBeEnabled({ timeout: 20_000 });
      await shutdownButton.click().catch(async () => shutdownButton.click({ force: true }));

      const modalPassword = shutdownPage.confirmationPasswordField;
      await modalPassword.waitFor({ state: 'visible', timeout: 20_000 }).catch(async () => {
        await page.screenshot({ path: 'shutdown-pump-password-modal-missing.png', fullPage: true });
        throw new Error('The password confirmation modal did not appear after clicking Shutdown.');
      });

      await expect(modalPassword).toBeVisible();
      // Do NOT execute — just verify the modal appeared, then close
      await page.keyboard.press('Escape').catch(() => {});
      await expect(modalPassword).not.toBeVisible({ timeout: 10_000 });
    });

    await assertStatusCodeAudit(page, statusAudit, '12-ShutdownPump.spec.ts');
  });
});
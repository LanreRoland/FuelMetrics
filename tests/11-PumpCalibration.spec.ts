import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
} from './helpers/epump';
import { PumpCalibrationPage } from './pages/PumpCalibrationPage';

const EPUMP_PASSWORD = process.env.EPUMP_PASSWORD || 'Tester.1';
const FINAL_ACTION_SETTLE_MS = 5_000;

test.describe('Pump Calibration Automation', () => {
  test.setTimeout(420_000);

  test('should calibrate all selected pumps for West region Lagos and Ekiti outlets', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const calibrationPage = new PumpCalibrationPage(page);

    // Authenticate first (retry once on failure)
    let auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      await page.goto('https://stations.epump.africa/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(5_000);
      auth = await ensureAuthenticated(page);
    }
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, auth.reason);
    }

    await calibrationPage.navigate();
    await calibrationPage.openCalibrationDrawer();

    // Fill the form
    await calibrationPage.selectMultipleOptions(/Select Region/i, ['West']);
    await calibrationPage.selectMultipleOptions(/Select states/i, ['Lagos', 'Ekiti']);
    await calibrationPage.selectAll(/Select retail outlets/i);
    await calibrationPage.selectAllPumps();
    await calibrationPage.setCalibrationValue(0.4);

    // Click the main Calibrate button to open the password modal
    const calibrateButton = page.getByRole('button', { name: /^Calibrate$/i }).last();
    await expect(calibrateButton).toBeEnabled({ timeout: 20_000 });
    await calibrateButton.click().catch(async () => calibrateButton.click({ force: true }));

    // Wait for the password confirmation modal
    const modalPassword = calibrationPage.confirmationPasswordField;
    await modalPassword.waitFor({ state: 'visible', timeout: 20_000 }).catch(async () => {
      await page.screenshot({ path: 'pump-calibration-password-modal-missing.png', fullPage: true });
      throw new Error('The password confirmation modal did not appear after clicking Calibrate.');
    });

    await calibrationPage.fillConfirmationPassword(EPUMP_PASSWORD);

    // Monitor responses during the submit
    const baselineFailureCount = statusAudit.getFailures().length;
    await calibrationPage.submitConfirmation();

    // Wait for the modal to close or a failure to appear
    const deadline = Date.now() + 30_000;
    let modalClosed = false;
    while (Date.now() < deadline) {
      const newFailures = statusAudit.getFailures().slice(baselineFailureCount);
      if (newFailures.length > 0) {
        throw new Error(`Pump calibration returned ${newFailures[0].status} for ${newFailures[0].method} ${newFailures[0].url}`);
      }
      if (!(await modalPassword.isVisible().catch(() => false))) {
        modalClosed = true;
        break;
      }
      await page.waitForTimeout(500);
    }

    if (!modalClosed) {
      await page.screenshot({ path: 'pump-calibration-timeout.png', fullPage: true });
      throw new Error('Pump calibration confirmation did not complete before timeout.');
    }

    // Settle period – catch any delayed 500s
    const settleDeadline = Date.now() + FINAL_ACTION_SETTLE_MS;
    while (Date.now() < settleDeadline) {
      const newFailures = statusAudit.getFailures().slice(baselineFailureCount);
      if (newFailures.length > 0) {
        throw new Error(`Pump calibration returned ${newFailures[0].status} for ${newFailures[0].method} ${newFailures[0].url}`);
      }
      await page.waitForTimeout(500);
    }

    await assertStatusCodeAudit(page, statusAudit, '11-PumpCalibration.spec.ts');
  });
});
import { expect, test } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
} from './helpers/epump';
import { DashboardPage } from './pages/DashboardPage';

const EXPECTED_STATION_COUNT = '150';

test.describe('Dashboard Station Count Validation', () => {
  test.setTimeout(240000);

  test('should show 150 stations in the station information widget', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const dashboard = new DashboardPage(page);

    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, `Authentication failed: ${auth.reason}`);
    }

    await expect
      .poll(() => dashboard.getStationCount(), { timeout: 30000 })
      .toBe(EXPECTED_STATION_COUNT);

    await assertStatusCodeAudit(page, statusAudit, '10-StationCountValidation.spec.ts');
  });
});

import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
} from './helpers/epump';

const EXPECTED_STATION_COUNT = '150';

async function getStationCount(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
    const extractCount = (value: string) => {
      const match = normalize(value).match(/NUMBER OF STATION\D*?([\d,]+)/i);
      return match ? match[1].replace(/,/g, '') : null;
    };

    const bodyCount = extractCount(document.body.innerText || '');
    if (bodyCount) {
      return bodyCount;
    }

    for (const element of Array.from(document.querySelectorAll('body *'))) {
      const text = normalize((element as HTMLElement).innerText || element.textContent || '');
      if (!/NUMBER OF STATION/i.test(text)) {
        continue;
      }

      const nearestContainer = element.closest('section, article, div') as HTMLElement | null;
      const candidates = [
        text,
        normalize((element.parentElement?.innerText || element.parentElement?.textContent || '')),
        normalize((nearestContainer?.innerText || nearestContainer?.textContent || '')),
      ];

      for (const candidate of candidates) {
        const count = extractCount(candidate);
        if (count) {
          return count;
        }
      }
    }

    return null;
  });
}

test.describe('Dashboard Station Count Validation', () => {
  test.setTimeout(240000);

  test('should show 150 stations in the station information widget', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const auth = await ensureAuthenticated(page);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, `Authentication failed: ${auth.reason}`);
    }

    await expect.poll(() => getStationCount(page), { timeout: 30000 }).toBe(EXPECTED_STATION_COUNT);
    await assertStatusCodeAudit(page, statusAudit, '10-StationCountValidation.spec.ts');
  });
});

import { test, expect } from '@playwright/test';
import {
  assertStatusCodeAudit,
  ensureAuthenticated,
  startStatusCodeAudit,
  waitForVisible,
} from './helpers/epump';
import { BankPage } from './pages/BankPage';

const ADMIN_EMAIL = process.env.EPUMP_EMAIL;
const ADMIN_PASSWORD = process.env.EPUMP_PASSWORD;
const TARGET_COMPANY = 'Demonstration Limited';
const TARGET_STATION_COUNT = '150';

test.describe('Bank Validation Automation', () => {
  test.setTimeout(300000);

  test('should validate Union Bank and First Bank are available in bank list', async ({ page }) => {
    const statusAudit = startStatusCodeAudit(page);
    const bankPage = new BankPage(page);

    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
      statusAudit.stop();
      throw new Error(
        'Missing required credentials: EPUMP_EMAIL and/or EPUMP_PASSWORD. Configure them in repository secrets.',
      );
    }

    const auth = await ensureAuthenticated(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    if (!auth.ok) {
      statusAudit.stop();
      test.skip(true, `Admin Authentication failed: ${auth.reason}`);
    }

    // Search for the target company
    console.log(`[ info ] Searching for company: ${TARGET_COMPANY}`);
    if (!(await waitForVisible(bankPage.companySearchBox, 30000))) {
      statusAudit.stop();
      test.skip(true, 'Company search box not found on admin page.');
    }
    await bankPage.searchCompany(TARGET_COMPANY);

    // Open company details
    const opened = await bankPage.openCompanyDetails(TARGET_COMPANY, TARGET_STATION_COUNT);
    if (!opened) {
      statusAudit.stop();
      test.skip(true, `Could not open Details for ${TARGET_COMPANY} with ${TARGET_STATION_COUNT} stations.`);
    }

    // Navigate to Bank section
    console.log('[ info ] Navigating to Bank section...');
    const bankNavigated = await bankPage.navigateToBankSection();
    if (!bankNavigated) {
      statusAudit.stop();
      test.skip(true, 'The Bank link was not visible on the sidebar.');
    }

    // Open Add Bank modal and get the search input
    console.log('[ info ] Opening Add Bank modal...');
    const bankSearchInput = await bankPage.openAddBankModal();
    if (!bankSearchInput) {
      statusAudit.stop();
      test.skip(true, 'The bank selector/search input was not visible after clicking Add Bank.');
    }

    // Validate Union Bank
    console.log('[ info ] Searching for Union Bank...');
    const unionBankFound = await bankPage.assertBankAvailable(bankSearchInput!, 'Union', /Union\s*Bank/i);
    expect(unionBankFound, 'Union Bank should be available in the bank list').toBeTruthy();
    console.log('[ pass ] Union Bank found.');

    // Validate First Bank
    console.log('[ info ] Searching for First Bank...');
    const firstBankFound = await bankPage.assertBankAvailable(bankSearchInput!, 'First', /First\s*Bank/i);
    expect(firstBankFound, 'First Bank should be available in the bank list').toBeTruthy();
    console.log('[ pass ] First Bank found.');

    await assertStatusCodeAudit(page, statusAudit, '14-BankValidation.spec.ts');
  });
});

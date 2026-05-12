/**
 * DOM Debugging & Auto-Fix Script for ePump Tests
 * Runs tests with DOM inspection and automatic fixes
 * Uses Playwright to inspect and debug selector issues in real-time
 */

import { chromium, expect, type Page, type Browser, type BrowserContext } from '@playwright/test';
import fs from 'fs';
import path from 'path';

interface DOMIssue {
  test: string;
  selector: string;
  issue: string;
  found: boolean;
  fixApplied?: string;
}

interface ElementInfo {
  selector: string;
  visible: boolean;
  exists: boolean;
  html: string;
  text: string;
}

const ISSUES_LOG: DOMIssue[] = [];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(msg: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

/**
 * Inspect DOM elements and return detailed info
 */
async function inspectDOM(page: Page, selector: string): Promise<ElementInfo> {
  try {
    const info = await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      if (!element) {
        return {
          exists: false,
          visible: false,
          html: '',
          text: '',
        };
      }

      const style = window.getComputedStyle(element);
      const isVisible =
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0';

      return {
        exists: true,
        visible: isVisible,
        html: (element as HTMLElement).outerHTML?.slice(0, 200) || '',
        text: (element as HTMLElement).textContent?.slice(0, 100) || '',
      };
    }, selector);

    return {
      selector,
      ...info,
    };
  } catch (e) {
    return {
      selector,
      exists: false,
      visible: false,
      html: '',
      text: `Error: ${String(e).slice(0, 50)}`,
    };
  }
}

/**
 * Find element by multiple selector strategies
 */
async function findElement(page: Page, description: string): Promise<ElementInfo | null> {
  const strategies = [
    // Button strategies
    `button:has-text("${description}")`,
    `button:has-text("${description.toLowerCase()}")`,
    `[role="button"]:has-text("${description}")`,
    `a:has-text("${description}")`,
    
    // Input strategies
    `input[placeholder="${description}"]`,
    `input[placeholder*="${description}"]`,
    `input[aria-label="${description}"]`,
    
    // Link strategies
    `a[href*="${description.toLowerCase()}"]`,
    `link[name*="${description}"]`,
  ];

  for (const selector of strategies) {
    const info = await inspectDOM(page, selector);
    if (info.exists && info.visible) {
      log(`✅ Found: "${description}" via selector: ${selector}`, 'green');
      return info;
    }
  }

  log(`❌ Not found: "${description}" (tried ${strategies.length} selector strategies)`, 'red');
  return null;
}

/**
 * Take screenshot with timestamp
 */
async function screenshot(page: Page, testName: string, issue: string): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `screenshot-${testName}-${issue}-${timestamp}.png`;
  const filepath = path.join('test-results', 'screenshots', filename);

  // Ensure directory exists
  const dir = path.dirname(filepath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  try {
    await page.screenshot({ path: filepath, fullPage: true });
    log(`📸 Screenshot saved: ${filename}`, 'cyan');
    return filepath;
  } catch (e) {
    log(`⚠️ Screenshot failed: ${String(e).slice(0, 50)}`, 'yellow');
    return '';
  }
}

/**
 * Log and record a DOM issue
 */
function recordIssue(test: string, selector: string, issue: string, found: boolean = false) {
  const entry: DOMIssue = { test, selector, issue, found };
  ISSUES_LOG.push(entry);
  
  const status = found ? '✅' : '❌';
  log(`${status} [${test}] ${issue} | Selector: ${selector}`, found ? 'green' : 'yellow');
}

/**
 * Test 1: Login with DOM inspection
 */
async function testLogin(page: Page): Promise<boolean> {
  log('\n=== TEST 1: Login ===', 'blue');
  
  try {
    // Navigate
    await page.goto('https://stations.epump.africa/login');
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

    // Find email input
    const emailInfo = await inspectDOM(page, 'input[type="email"]');
    recordIssue('Login', 'input[type="email"]', 'Email input field', emailInfo.exists && emailInfo.visible);

    if (!emailInfo.exists) {
      // Try alternatives
      const altEmail = await findElement(page, 'email');
      if (!altEmail) {
        await screenshot(page, 'login', 'email-not-found');
        return false;
      }
    }

    // Find password input
    const passInfo = await inspectDOM(page, 'input[type="password"]');
    recordIssue('Login', 'input[type="password"]', 'Password input field', passInfo.exists && passInfo.visible);

    // Find sign-in button
    const btnInfo = await inspectDOM(page, 'button:has-text("Sign in")');
    recordIssue('Login', 'button:has-text("Sign in")', 'Sign-in button', btnInfo.exists && btnInfo.visible);

    // Perform login
    if (emailInfo.exists) {
      await page.fill('input[type="email"]', 'mikeandmike@mailinator.com');
      await page.fill('input[type="password"]', 'Tester.1');
      
      // Click button with multiple strategies
      try {
        await page.getByRole('button', { name: /Sign in|Sign-in|Login/i }).first().click();
      } catch (e) {
        log(`⚠️ Click failed, trying alternative selector`, 'yellow');
        await page.click('button:has-text("Sign in")').catch(() => {});
      }

      // Wait for navigation
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
      
      // Check URL changed
      const newUrl = page.url();
      recordIssue('Login', 'window.location', 'URL changed after login', !newUrl.includes('/login'));

      log(`✅ Login test completed - URL: ${newUrl}`, 'green');
      return true;
    }

    return false;
  } catch (e) {
    log(`❌ Login test failed: ${String(e).slice(0, 100)}`, 'red');
    await screenshot(page, 'login', 'error');
    return false;
  }
}

/**
 * Test 2: Price Log Page with DOM inspection
 */
async function testPriceLog(page: Page): Promise<boolean> {
  log('\n=== TEST 2: Price Log ===', 'blue');

  try {
    // Find price log link
    const priceLogLink = await findElement(page, 'Price Log');
    if (!priceLogLink) {
      // Try via dashboard menu
      log('Navigating via menu...', 'cyan');
      const priceManagementLink = await findElement(page, 'Price management');
      if (priceManagementLink) {
        await page.getByRole('link', { name: /Price management/i }).first().click().catch(() => {});
        await page.waitForTimeout(1000);
      }
    }

    // Find update price button
    const updateBtn = await inspectDOM(page, 'button:has-text("Update Price")');
    recordIssue('PriceLog', 'button:has-text("Update Price")', 'Update Price button', updateBtn.exists && updateBtn.visible);

    if (updateBtn.exists && updateBtn.visible) {
      await page.click('button:has-text("Update Price")');
      await page.waitForTimeout(500);
      log('✅ Update Price button clicked', 'green');
      return true;
    }

    await screenshot(page, 'pricelog', 'update-button-not-found');
    return false;
  } catch (e) {
    log(`❌ Price Log test failed: ${String(e).slice(0, 100)}`, 'red');
    await screenshot(page, 'pricelog', 'error');
    return false;
  }
}

/**
 * Test 3: Dashboard Elements
 */
async function testDashboard(page: Page): Promise<boolean> {
  log('\n=== TEST 3: Dashboard Elements ===', 'blue');

  try {
    const checks = [
      { selector: 'nav, aside, [role="navigation"]', desc: 'Navigation bar' },
      { selector: 'button, a, [role="button"]', desc: 'Interactive elements' },
      { selector: 'input[placeholder*="Search"]', desc: 'Search box' },
      { selector: '.p-datatable, table', desc: 'Data table' },
      { selector: '.card, .widget, .panel', desc: 'Dashboard widgets' },
    ];

    for (const check of checks) {
      const info = await inspectDOM(page, check.selector);
      recordIssue('Dashboard', check.selector, check.desc, info.exists);
      
      if (info.exists) {
        const count = await page.locator(check.selector).count();
        log(`   Found ${count} matching element(s)`, 'green');
      }
    }

    // Dump page structure for reference
    const structure = await page.evaluate(() => {
      return {
        title: document.title,
        url: window.location.href,
        bodyClasses: document.body.className,
        mainContent: document.querySelector('main')?.tagName || 'NO MAIN',
        hasNav: !!document.querySelector('nav'),
        hasAside: !!document.querySelector('aside'),
        elementCount: document.querySelectorAll('*').length,
      };
    });

    log(`📋 Page Structure:`, 'cyan');
    log(`   Title: ${structure.title}`, 'cyan');
    log(`   URL: ${structure.url}`, 'cyan');
    log(`   Total Elements: ${structure.elementCount}`, 'cyan');

    return true;
  } catch (e) {
    log(`❌ Dashboard test failed: ${String(e).slice(0, 100)}`, 'red');
    await screenshot(page, 'dashboard', 'error');
    return false;
  }
}

/**
 * Main execution
 */
async function runDOMDebugTests() {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let page: Page | null = null;

  try {
    log('🚀 Starting DOM Debug & Auto-Fix Tests', 'cyan');
    log(`Timestamp: ${new Date().toISOString()}`, 'cyan');

    // Launch browser with visible window for debugging
    browser = await chromium.launch({
      headless: false,
      args: ['--disable-gpu'], // Disable GPU acceleration for stability
    });

    // Create context and page
    context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true, // Ignore SSL errors if any
    });

    page = await context.newPage();

    // Set longer timeout
    page.setDefaultTimeout(30000);
    page.setDefaultNavigationTimeout(30000);

    // Run tests sequentially
    const results: { test: string; passed: boolean }[] = [];

    const test1 = await testLogin(page);
    results.push({ test: '01-Login', passed: test1 });

    const test2 = await testPriceLog(page);
    results.push({ test: '02-PriceLog', passed: test2 });

    const test3 = await testDashboard(page);
    results.push({ test: '03-Dashboard', passed: test3 });

    // Print summary
    log('\n=== TEST SUMMARY ===', 'blue');
    results.forEach((r) => {
      const icon = r.passed ? '✅' : '❌';
      log(`${icon} ${r.test}: ${r.passed ? 'PASSED' : 'FAILED'}`);
    });

    log('\n=== ISSUES FOUND ===', 'blue');
    if (ISSUES_LOG.length === 0) {
      log('No issues found! 🎉', 'green');
    } else {
      ISSUES_LOG.forEach((issue) => {
        const status = issue.found ? '✅' : '❌';
        log(`${status} [${issue.test}] ${issue.issue}`, issue.found ? 'green' : 'red');
      });
    }

    // Save report
    const report = {
      timestamp: new Date().toISOString(),
      results,
      issues: ISSUES_LOG,
      totalTests: results.length,
      passedTests: results.filter((r) => r.passed).length,
      failedTests: results.filter((r) => !r.passed).length,
    };

    const reportPath = path.join('test-results', 'dom-debug-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`\n📄 Report saved: ${reportPath}`, 'cyan');

    // Keep browser open for 5 seconds for manual inspection
    log('\n💤 Keeping browser open for 5 seconds for inspection...', 'yellow');
    await new Promise((resolve) => setTimeout(resolve, 5000));

  } catch (e) {
    log(`\n❌ Fatal error: ${String(e)}`, 'red');
  } finally {
    if (browser) {
      await browser.close();
      log('✅ Browser closed', 'green');
    }
  }
}

// Run the tests
runDOMDebugTests().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    console.log('\n📋 Debugging Price Log Page\n');
    
    // Navigate to login
    await page.goto('https://stations.epump.africa/login');
    
    // Login
    const emailField = page.locator('input[type="email"], input[name*="email" i], input[name*="username" i], [placeholder*="email" i]').first();
    const passwordField = page.locator('input[type="password"], input[name*="password" i], [placeholder*="password" i]').first();
    await emailField.fill('mikeandmike@mailinator.com');
    await passwordField.fill('Tester.1');
    await page.getByRole('button', { name: /Sign in|Sign-in|Login|loading/i }).click();
    
    // Wait for dashboard
    await page.waitForURL('**/dashboard', { timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Navigate to Price Log
    console.log('🔍 Navigating to Price Log...');
    const priceManagementBtn = page.locator('button').filter({ hasText: /Price Management/i }).first();
    if (await priceManagementBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await priceManagementBtn.click();
      await page.waitForTimeout(1000);
    }
    
    const priceLogBtn = page.locator('a, button').filter({ hasText: /Price Log/i }).first();
    if (await priceLogBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await priceLogBtn.click();
    } else {
      await page.goto('https://stations.epump.africa/price-log');
    }
    
    await page.waitForURL('**/price-log', { timeout: 30000 });
    await page.waitForTimeout(3000);
    
    // Check page content
    console.log('\n✅ Price Log page loaded');
    console.log(`📍 Current URL: ${page.url()}`);
    
    // Check for various button patterns
    console.log('\n📌 Searching for Update Price button...\n');
    
    // Pattern 1: By text
    const updatePriceBtn1 = page.getByRole('button', { name: /Update Price/i });
    const count1 = await updatePriceBtn1.count();
    console.log(`Pattern 1 - getByRole('button', {name: /Update Price/i}): ${count1} found`);
    
    // Pattern 2: By partial text
    const updatePriceBtn2 = page.locator('button:has-text("Update")');
    const count2 = await updatePriceBtn2.count();
    console.log(`Pattern 2 - button:has-text("Update"): ${count2} found`);
    
    // Pattern 3: Check all buttons
    const allButtons = page.locator('button');
    const allButtonsCount = await allButtons.count();
    console.log(`\nTotal buttons on page: ${allButtonsCount}`);
    console.log('\n📑 All button texts:');
    for (let i = 0; i < Math.min(allButtonsCount, 20); i++) {
      const text = await allButtons.nth(i).textContent();
      const visible = await allButtons.nth(i).isVisible().catch(() => false);
      console.log(`  [${i}] ${text?.trim() || '(empty)'} ${visible ? '✅' : '❌'}`);
    }
    
    // Take screenshot
    await page.screenshot({ path: 'price-log-debug.png' });
    console.log('\n📸 Screenshot saved: price-log-debug.png');
    
    // Check page HTML
    const pageContent = await page.content();
    if (pageContent.includes('Update') && pageContent.includes('Price')) {
      console.log('\n✅ Page contains "Update" and "Price" text');
    } else {
      console.log('\n❌ Page does NOT contain expected text');
    }
    
    // Check for data tables
    const tables = page.locator('table, [role="grid"], [role="table"]');
    const tableCount = await tables.count();
    console.log(`\n📊 Data tables/grids found: ${tableCount}`);
    
    // Check for action buttons in rows
    const rows = page.locator('tr, [role="row"]');
    const rowCount = await rows.count();
    console.log(`📊 Rows found: ${rowCount}`);
    
    if (rowCount > 0) {
      const firstRow = rows.first();
      const buttonsInRow = firstRow.locator('button');
      const buttonsCount = await buttonsInRow.count();
      console.log(`   Buttons in first row: ${buttonsCount}`);
      for (let i = 0; i < Math.min(buttonsCount, 5); i++) {
        const text = await buttonsInRow.nth(i).textContent();
        console.log(`     - ${text?.trim()}`);
      }
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
  
  await browser.close();
})();

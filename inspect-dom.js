/**
 * DOM Inspector - Analyze page structure to fix selector issues
 * Logs in and inspects what elements are actually available
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');

async function inspectPageStructure() {
  let browser = null;
  
  try {
    console.log('🚀 Launching browser for DOM inspection...');
    browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();
    
    // Login
    console.log('📱 Navigating to login page...');
    await page.goto('https://stations.epump.africa/login', { 
      waitUntil: 'domcontentloaded',
      timeout: 120000 
    });

    console.log('⏳ Waiting for login form...');
    await page.fill('input[type="email"]', 'mikeandmike@mailinator.com');
    await page.fill('input[type="password"]', 'Tester.1');
    await page.click('button:has-text("Sign in")');
    
    console.log('⏳ Waiting for dashboard after login...');
    await page.waitForTimeout(5000);

    // Inspect page structure
    console.log('\n📋 === PAGE STRUCTURE INSPECTION ===\n');

    const structure = await page.evaluate(async () => {
      // Find all navigation-related elements
      const links = Array.from(document.querySelectorAll('a, [role="link"], button[role="button"]'))
        .map(el => ({
          tagName: el.tagName,
          text: el.textContent?.trim().slice(0, 50),
          href: el.getAttribute('href')|| '',
          className: el.className,
          visible: window.getComputedStyle(el).display !== 'none',
        }))
        .filter(el => el.text && el.visible)
        .slice(0, 30);

      // Find navigational sections
      const nav = document.querySelector('nav') || document.querySelector('aside') || document.querySelector('[role="navigation"]');
      const navHTML = nav ? nav.outerHTML.slice(0, 500) : 'NOT FOUND';

      // Find buttons
      const buttons = Array.from(document.querySelectorAll('button'))
        .map(btn => btn.textContent?.trim())
        .filter(Boolean)
        .slice(0, 20);

      // Find all elements with "price" in text (case-insensitive)
      const priceElements = Array.from(document.querySelectorAll('*'))
        .filter(el => el.textContent?.toLowerCase().includes('price'))
        .map(el => ({
          tagName: el.tagName,
          text: el.textContent?.trim().slice(0, 60),
          className: el.className,
        }))
        .slice(0, 15);

      // Analyze sidebar/menu structure
      const sidebar = document.querySelector('aside') || document.querySelector('.sidebar') || document.querySelector('[class*="side"]');
      const sidebarText = sidebar ? sidebar.textContent?.trim().slice(0, 500) : 'NO SIDEBAR';

      return {
        url: window.location.href,
        title: document.title,
        bodyClasses: document.body.className,
        elementCount: document.querySelectorAll('*').length,
        allLinks: links,
        buttons,
        priceElements,
        navHTML,
        sidebarStructure: sidebarText,
      };
    });

    console.log('📄 Current URL:', structure.url);
    console.log('📄 Page Title:', structure.title);
    console.log('📄 Total Elements:', structure.elementCount);

    console.log('\n🔗 === NAVIGATION LINKS ===');
    structure.allLinks.forEach((link, i) => {
      console.log(`  ${i+1}. [${link.tagName}] ${link.text} (href: ${link.href || 'none'})`);
    });

    console.log('\n🔘 === BUTTONS ===');
    structure.buttons.forEach((btn, i) => {
      console.log(`  ${i+1}. ${btn}`);
    });

    console.log('\n💰 === "PRICE" RELATED ELEMENTS ===');
    structure.priceElements.forEach((el, i) => {
      console.log(`  ${i+1}. [${el.tagName}] ${el.text}`);
    });

    console.log('\n📍 === NAVIGATION/SIDEBAR STRUCTURE ===');
    console.log(structure.navHTML || 'NOT FOUND - checking sidebar...');
    console.log('\nSidebar Content Preview:');
    console.log(structure.sidebarStructure);

    // Try to interact with price management menu
    console.log('\n\n🔧 === ATTEMPTING TO NAVIGATE TO PRICE LOG ===\n');

    // Try clicking "Price Management" or similar
    const priceLinks = ['Price Management', 'Price Log', 'Price management', 'price log', 'Price', 'Pricing'];
    let found = false;

    for (const linkText of priceLinks) {
      try {
        const locator = page.getByRole('link', { name: new RegExp(linkText, 'i') }).first();
        const isVisible = await locator.isVisible().catch(() => false);
        
        if (isVisible) {
          console.log(`✅ Found: "${linkText}" - VISIBLE`);
          console.log(`📸 Taking screenshot before click...`);
          await page.screenshot({ path: 'before-click.png' });
          
          console.log(`🖱️ Clicking "${linkText}"...`);
          await locator.click();
          await page.waitForTimeout(2000);
          
          const newUrl = page.url();
          console.log(`✅ After click - URL: ${newUrl}`);
          console.log(`📸 Taking screenshot after click...`);
          await page.screenshot({ path: 'after-click.png' });
          
          found = true;
          break;
        } else {
          console.log(`❌ Found selector but not visible: "${linkText}"`);
        }
      } catch (e) {
        console.log(`❌ Not found: "${linkText}" (${String(e).slice(0, 40)})`);
      }
    }

    if (!found) {
      console.log('\n⚠️ Could not find Price-related navigation link');
      console.log('Taking final screenshot for manual inspection...');
      await page.screenshot({ path: 'final-inspection.png' });
    }

    // Save detailed report
    const report = {
      timestamp: new Date().toISOString(),
      url: structure.url,
      title: structure.title,
      elementCount: structure.elementCount,
      allLinks: structure.allLinks,
      buttons: structure.buttons,
      priceElements: structure.priceElements,
      sidebarText: structure.sidebarStructure,
    };

    fs.writeFileSync('dom-inspection-report.json', JSON.stringify(report, null, 2));
    console.log('\n📄 Full report saved to: dom-inspection-report.json');

    // Keep browser open for manual inspection
    console.log('\n💤 Keeping browser open for 15 seconds for manual inspection...');
    await  new Promise(resolve => setTimeout(resolve, 15000));

  } catch (e) {
    console.error('❌ Error:', String(e));
  } finally {
    if (browser) {
      await browser.close();
      console.log('\n✅ Browser closed');
    }
  }
}

inspectPageStructure().catch(console.error);

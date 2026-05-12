#!/usr/bin/env powershell
# Quick ePump test runner with multiple modes

param(
    [string]$Mode = "headless",
    [switch]$Debug
)

Write-Host "╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║                  ePump Test Runner                              ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan

Write-Host ""
Write-Host "Mode: $Mode" -ForegroundColor Yellow
Write-Host "Debug: $Debug" -ForegroundColor Yellow
Write-Host ""

$env:EPUMP_EMAIL = "mikeandmike@mailinator.com"
$env:EPUMP_PASSWORD = "Tester.1"
$env:DEBUG = if ($Debug) { "true" } else { "false" }

switch ($Mode) {
    "headless" {
        Write-Host "🚀 Running tests in HEADLESS mode (faster)" -ForegroundColor Green
        Write-Host "   No browser window will open" -ForegroundColor Gray
        cd "c:\Users\USER\Lanre\Epump"
        npx playwright test 01-login.spec.ts --reporter=line
        break
    }
    
    "headed" {
        Write-Host "🖥️  Running tests in HEADED mode (slow, see browser)" -ForegroundColor Green
        Write-Host "   Browser window will be visible" -ForegroundColor Gray
        cd "c:\Users\USER\Lanre\Epump"
        npx playwright test 01-login.spec.ts --headed --reporter=line
        break
    }
    
    "debug" {
        Write-Host "🐛 Running tests in DEBUG mode (interactive)" -ForegroundColor Green
        Write-Host "   Browser will be visible and you can interact" -ForegroundColor Gray
        cd "c:\Users\USER\Lanre\Epump"
        npx playwright test 01-login.spec.ts --headed --debug
        break
    }
    
    "all" {
        Write-Host "🧪 Running ALL tests in headless mode" -ForegroundColor Green
        cd "c:\Users\USER\Lanre\Epump"
        npx playwright test --reporter=html
        npx playwright show-report
        break
    }
    
    "skip-login" {
        Write-Host "⏭️  Skipping login test, running others" -ForegroundColor Green
        cd "c:\Users\USER\Lanre\Epump"
        npx playwright test --grep "^((?!login).)*$" --reporter=line
        break
    }
    
    default {
        Write-Host "❌ Unknown mode: $Mode" -ForegroundColor Red
        Write-Host ""
        Write-Host "Available modes:" -ForegroundColor Yellow
        Write-Host "  headless   - Run tests without browser window (FASTEST)" -ForegroundColor Gray
        Write-Host "  headed     - Run tests with visible browser" -ForegroundColor Gray
        Write-Host "  debug      - Run with interactive debugger" -ForegroundColor Gray
        Write-Host "  all        - Run all tests with HTML report" -ForegroundColor Gray
        Write-Host "  skip-login - Run all tests except login" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Examples:" -ForegroundColor Yellow
        Write-Host "  .\run-tests.ps1 -Mode headless" -ForegroundColor Gray
        Write-Host "  .\run-tests.ps1 -Mode headed -Debug" -ForegroundColor Gray
        Write-Host "  .\run-tests.ps1 -Mode skip-login" -ForegroundColor Gray
    }
}

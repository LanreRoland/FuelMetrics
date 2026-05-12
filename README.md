# ePump Playwright Tests

Standalone test project for ePump-related automation.

## Structure
- `tests/`: ePump spec files
- `tests/helpers/epump.ts`: shared helper utilities
- `playwright.config.ts`: test runner config
- `test-results/`: raw Playwright output
- `playwright-report/`: HTML report

## Run
1. `cd Epump`
2. `npm install`
3. `npx playwright test`

## Useful commands
- `npm run test:list`
- `npm run test:smoke`
- `npm run report`

## Environment variables
- `EPUMP_URL`
- `EPUMP_EMAIL`
- `EPUMP_PASSWORD`
- `EPUMP_RUN_LOAD_TESTS`

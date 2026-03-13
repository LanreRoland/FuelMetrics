# Epump Login Automation Test

This project contains an automated Playwright test for the login flow of `https://stations.epump.africa`.

## Prerequisites
- Node.js installed

## Setup
1. Open your terminal in this directory (`c:\Users\USER\Lanre`)
2. Run standard installation (already done by the setup):
   ```bash
   npm install
   ```

## Running the test
To run the automated login flow and see the browser executing the steps:
```bash
npx playwright test --ui
```
*(The `--ui` flag opens the Playwright test runner where you can visually watch the test steps execute, which is great for debugging or verifying the login flow).*

Or, to run it headlessly (without opening browser UI):
```bash
npx playwright test
```

## Note on Credentials
The `tests/login.spec.ts` script uses placeholder credentials:
- Email: `testuser@example.com`
- Password: `SecurePassword123`

Because these credentials are not valid for Epump, the test will correctly attempt the login but will fail on the final step (waiting for the dashboard to load). You can update the `login.spec.ts` file with valid testing credentials to have it pass completely to the dashboard.

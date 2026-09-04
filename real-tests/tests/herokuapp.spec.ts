/**
 * Real test: The Internet (Herokuapp) — Tests against https://the-internet.herokuapp.com
 *
 * A widely-used test practice site with various UI patterns.
 */
import { test, expect } from '@playwright/test';

const BASE_URL = 'https://the-internet.herokuapp.com';

test.describe('The Internet - Herokuapp', () => {

  test('should login with valid credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    await page.locator('#username').fill('tomsmith');
    await page.locator('#password').fill('SuperSecretPassword!');
    await page.locator('button[type="submit"]').click();

    await expect(page.locator('.flash.success')).toBeVisible();
    await expect(page.locator('.flash.success')).toContainText('You logged into a secure area!');
  });

  // WILL FAIL — Wrong credentials (Test Data Issue)
  test('should login with staging environment credentials', async ({ page }) => {
    await page.goto(`${BASE_URL}/login`);
    // Using "staging" credentials that don't exist on this environment
    await page.locator('#username').fill('staging_admin');
    await page.locator('#password').fill('StagingPass2025!');
    await page.locator('button[type="submit"]').click();

    // Expecting success but will get error
    await expect(page.locator('.flash.success')).toBeVisible({ timeout: 5000 });
  });

  test('should display checkboxes page', async ({ page }) => {
    await page.goto(`${BASE_URL}/checkboxes`);
    const checkboxes = page.locator('input[type="checkbox"]');
    await expect(checkboxes).toHaveCount(2);
  });

  // WILL FAIL — Locator Issue: the dropdown uses <select>, not a custom dropdown
  test('should select option from dropdown using custom handler', async ({ page }) => {
    await page.goto(`${BASE_URL}/dropdown`);

    // BUG: Trying to click a non-existent dropdown trigger button
    await page.locator('.dropdown-trigger-btn').click({ timeout: 5000 });
    await page.locator('.dropdown-option[data-value="2"]').click({ timeout: 3000 });

    await expect(page.locator('#dropdown')).toHaveValue('2');
  });

  // WILL FAIL — Environment/Infra: trying to reach a non-existent endpoint
  test('should load the status codes page and verify 500 error page', async ({ page }) => {
    // Navigating to a URL that may be slow or unavailable
    const response = await page.goto(`${BASE_URL}/status_codes/500`);

    // The page itself shows a 500 status message, but response status is 500
    expect(response?.status()).toBe(200);
  });

  test('should handle JavaScript alerts', async ({ page }) => {
    await page.goto(`${BASE_URL}/javascript_alerts`);

    // Handle the alert dialog
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    await page.locator('button:text("Click for JS Alert")').click();
    await expect(page.locator('#result')).toHaveText('You successfully clicked an alert');
  });

  // WILL FAIL — Timing: page with dynamic loading, not waiting properly
  test('should wait for dynamically loaded element', async ({ page }) => {
    await page.goto(`${BASE_URL}/dynamic_loading/2`);
    await page.locator('#start button').click();

    // BUG: Checking immediately without waiting for the loading to finish
    // The element takes ~5s to appear, but we check with a tiny timeout
    await expect(page.locator('#finish h4')).toHaveText('Hello World!', { timeout: 1000 });
  });
});

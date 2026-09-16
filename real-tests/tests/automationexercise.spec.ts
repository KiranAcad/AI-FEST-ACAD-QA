/**
 * Real test: Automation Exercise — Tests against https://automationexercise.com
 *
 * A full-featured e-commerce practice site covering signup, products,
 * cart, and contact forms.
 */
import { test, expect } from '@playwright/test';

const AE_URL = 'https://automationexercise.com';

test.describe('Automation Exercise - E-Commerce', () => {

  test('should load homepage and verify brand logo', async ({ page }) => {
    await page.goto(AE_URL);
    await expect(page.locator('.logo img')).toBeVisible();
    await expect(page).toHaveTitle(/Automation Exercise/);
  });

  test('should navigate to products page', async ({ page }) => {
    await page.goto(AE_URL);
    await page.locator('a[href="/products"]').click();
    await expect(page).toHaveURL(/products/);
    await expect(page.locator('.title')).toContainText('All Products');
  });

  // WILL FAIL — Locator Issue: wrong search input selector
  test('should search for "Blue Top" product', async ({ page }) => {
    await page.goto(`${AE_URL}/products`);

    // BUG: Using wrong selector — actual is #search_product
    await page.locator('#product-search-input').fill('Blue Top', { timeout: 5000 });
    await page.locator('#submit_search').click();

    await expect(page.locator('.productinfo')).toBeVisible();
  });

  // WILL FAIL — Assertion Bug: wrong price verification
  test('should verify first product price on homepage', async ({ page }) => {
    await page.goto(AE_URL);

    const firstProductPrice = page.locator('.productinfo p').first();
    await expect(firstProductPrice).toBeVisible();

    const priceText = await firstProductPrice.textContent();
    // BUG: Asserting exact price that may have changed
    expect(priceText).toBe('Rs. 999');
  });

  // WILL FAIL — Environment Issue: contact form requires CAPTCHA/consent
  test('should submit contact us form', async ({ page }) => {
    await page.goto(`${AE_URL}/contact_us`);

    await page.locator('[data-qa="name"]').fill('Test User');
    await page.locator('[data-qa="email"]').fill('test@example.com');
    await page.locator('[data-qa="subject"]').fill('Bug Report');
    await page.locator('[data-qa="message"]').fill('Found a bug in checkout');

    // BUG: Trying to click submit but there may be an ad overlay or CAPTCHA
    await page.locator('[data-qa="submit-button"]').click({ timeout: 5000 });

    // Expecting success message
    await expect(page.locator('.alert-success')).toContainText('Success', { timeout: 5000 });
  });
});

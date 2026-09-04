/**
 * Real test: SauceDemo — Tests against https://www.saucedemo.com
 *
 * A practice e-commerce site from Sauce Labs. Perfect for cart/checkout tests.
 */
import { test, expect } from '@playwright/test';

const SAUCE_URL = 'https://www.saucedemo.com';

test.describe('SauceDemo E-Commerce', () => {

  test('should login with standard user', async ({ page }) => {
    await page.goto(SAUCE_URL);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();

    await expect(page).toHaveURL(/inventory/);
    await expect(page.locator('.title')).toHaveText('Products');
  });

  // WILL FAIL — Application Bug: locked_out_user is deliberately locked
  test('should login with locked out user and see products', async ({ page }) => {
    await page.goto(SAUCE_URL);
    await page.locator('#user-name').fill('locked_out_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();

    // This will fail because locked_out_user gets an error, not products page
    await expect(page).toHaveURL(/inventory/, { timeout: 5000 });
  });

  test('should add item to cart and verify cart badge', async ({ page }) => {
    await page.goto(SAUCE_URL);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();

    await page.locator('[data-test="add-to-cart-sauce-labs-backpack"]').click();
    await expect(page.locator('.shopping_cart_badge')).toHaveText('1');
  });

  // WILL FAIL — Test Script Bug: wrong sort order assertion
  test('should sort products by price low to high', async ({ page }) => {
    await page.goto(SAUCE_URL);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();

    // Sort by price low-to-high
    await page.locator('[data-test="product-sort-container"]').selectOption('lohi');

    // Get all prices
    const priceElements = page.locator('.inventory_item_price');
    const priceCount = await priceElements.count();
    const prices: number[] = [];
    for (let i = 0; i < priceCount; i++) {
      const text = await priceElements.nth(i).textContent();
      prices.push(parseFloat(text?.replace('$', '') || '0'));
    }

    // BUG IN TEST: Asserting descending order instead of ascending
    for (let i = 0; i < prices.length - 1; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i + 1]);
    }
  });

  test('should navigate to cart page', async ({ page }) => {
    await page.goto(SAUCE_URL);
    await page.locator('#user-name').fill('standard_user');
    await page.locator('#password').fill('secret_sauce');
    await page.locator('#login-button').click();

    await page.locator('.shopping_cart_link').click();
    await expect(page.locator('.title')).toHaveText('Your Cart');
  });
});

/**
 * Real test: GitHub Public Pages — Tests against https://github.com
 *
 * Tests public-facing GitHub pages including search, repository views,
 * and the explore page. No authentication required.
 */
import { test, expect } from '@playwright/test';

const GITHUB_URL = 'https://github.com';

test.describe('GitHub - Public Pages', () => {

  test('should load GitHub homepage', async ({ page }) => {
    await page.goto(GITHUB_URL);
    await expect(page).toHaveTitle(/GitHub/);
  });

  test('should navigate to explore page', async ({ page }) => {
    await page.goto(`${GITHUB_URL}/explore`);
    await expect(page.locator('h1')).toBeVisible();
  });

  // WILL FAIL — Locator Issue: old class names that GitHub has changed
  test('should search for playwright repository', async ({ page }) => {
    await page.goto(GITHUB_URL);

    // BUG: GitHub search input selector has changed from the old class-based approach
    await page.locator('.header-search-input').fill('playwright', { timeout: 5000 });
    await page.locator('.header-search-input').press('Enter');

    await expect(page).toHaveURL(/search/);
    await expect(page.locator('.repo-list-item').first()).toBeVisible();
  });

  // WILL FAIL — Assertion Bug: wrong expected heading text
  test('should display trending repositories page', async ({ page }) => {
    await page.goto(`${GITHUB_URL}/trending`);

    // BUG: The heading text is "Trending" not "Trending Repositories Today"
    await expect(page.locator('h1')).toHaveText('Trending Repositories Today', { timeout: 5000 });
  });

  // WILL FAIL — Application Behavior: rate limiting may block
  test('should view microsoft/playwright repository stars count', async ({ page }) => {
    await page.goto(`${GITHUB_URL}/microsoft/playwright`);

    // Check that star count element exists and has a numeric value
    const starCount = page.locator('#repo-stars-counter-star');
    await expect(starCount).toBeVisible({ timeout: 5000 });

    const text = await starCount.textContent();
    // BUG: Asserting star count is exactly "50000" — real value changes constantly
    expect(text?.trim()).toBe('50000');
  });
});

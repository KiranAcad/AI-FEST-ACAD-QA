/**
 * Real test: Wikipedia — Tests against https://en.wikipedia.org
 *
 * Tests search functionality, page navigation, and content verification
 * on the world's largest encyclopedia.
 */
import { test, expect } from '@playwright/test';

const WIKI_URL = 'https://en.wikipedia.org';

test.describe('Wikipedia - Search & Navigation', () => {

  test('should load Wikipedia main page', async ({ page }) => {
    await page.goto(WIKI_URL);
    await expect(page.locator('#mp-welcome')).toBeVisible();
    await expect(page).toHaveTitle(/Wikipedia/);
  });

  test('should search for "Playwright" and see results', async ({ page }) => {
    await page.goto(WIKI_URL);

    await page.locator('#searchInput').fill('Playwright testing');
    await page.locator('#searchInput').press('Enter');

    // Should navigate to search results or article
    await expect(page).toHaveURL(/wiki|search/);
  });

  // WILL FAIL — Locator Issue: searching for non-existent element
  test('should open article sidebar navigation', async ({ page }) => {
    await page.goto(`${WIKI_URL}/wiki/Selenium_(software)`);

    // BUG: Trying to click a non-existent sidebar toggle button
    await page.locator('#sidebar-toggle-btn').click({ timeout: 5000 });
    await expect(page.locator('.sidebar-panel')).toBeVisible();
  });

  // WILL FAIL — Assertion Bug: wrong expected language count
  test('should verify language count on main page', async ({ page }) => {
    await page.goto(WIKI_URL);

    const languageLinks = page.locator('.central-featured-lang');
    const count = await languageLinks.count();

    // BUG: Asserting exactly 15 but the actual count differs
    expect(count).toBe(15);
  });

  // WILL FAIL — Timing Issue: content loads dynamically
  test('should expand table of contents on article page', async ({ page }) => {
    await page.goto(`${WIKI_URL}/wiki/Software_testing`);

    // BUG: Using wrong selector for TOC toggle — modern Wikipedia changed this
    await page.locator('.toctogglecheckbox').check({ timeout: 3000 });
    await expect(page.locator('.toc-list')).toBeVisible({ timeout: 2000 });
  });
});

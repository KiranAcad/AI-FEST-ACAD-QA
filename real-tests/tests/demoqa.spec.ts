/**
 * Real test: DemoQA — Tests against https://demoqa.com
 *
 * A practice site for UI automation covering forms, widgets, interactions, and more.
 */
import { test, expect } from '@playwright/test';

const DEMOQA_URL = 'https://demoqa.com';

test.describe('DemoQA - Forms & Widgets', () => {

  test('should fill and submit the practice form', async ({ page }) => {
    await page.goto(`${DEMOQA_URL}/automation-practice-form`);

    await page.locator('#firstName').fill('John');
    await page.locator('#lastName').fill('Doe');
    await page.locator('#userEmail').fill('john.doe@test.com');

    // Select gender
    await page.locator('label[for="gender-radio-1"]').click();

    await page.locator('#userNumber').fill('1234567890');

    // Submit
    await page.locator('#submit').click();

    // Verify the modal confirmation
    await expect(page.locator('#example-modal-sizes-title-lg')).toHaveText('Thanks for submitting the form');
  });

  test('should expand and select checkboxes in tree', async ({ page }) => {
    await page.goto(`${DEMOQA_URL}/checkbox`);

    // Expand all
    await page.locator('button[title="Expand all"]').click();

    // Select "Desktop" checkbox
    await page.locator('label[for="tree-node-desktop"]').click();

    // Verify result shows selected items
    const result = page.locator('#result');
    await expect(result).toContainText('desktop');
  });

  test('should select radio buttons', async ({ page }) => {
    await page.goto(`${DEMOQA_URL}/radio-button`);

    // Click "Impressive" radio
    await page.locator('label[for="impressiveRadio"]').click();

    const result = page.locator('.mt-3');
    await expect(result).toContainText('Impressive');
  });

  // WILL FAIL — Intentional locator/interaction bug: the "No" radio is disabled
  test('should select disabled radio button', async ({ page }) => {
    await page.goto(`${DEMOQA_URL}/radio-button`);

    // BUG: The "No" radio is disabled on this page — click will fail or timeout
    await page.locator('label[for="noRadio"]').click({ timeout: 3000 });

    const result = page.locator('.mt-3');
    await expect(result).toContainText('No');
  });

  test('should add a new row to the web table', async ({ page }) => {
    await page.goto(`${DEMOQA_URL}/webtables`);

    await page.locator('#addNewRecordButton').click();

    await page.locator('#firstName').fill('Alice');
    await page.locator('#lastName').fill('Smith');
    await page.locator('#userEmail').fill('alice@example.com');
    await page.locator('#age').fill('30');
    await page.locator('#salary').fill('75000');
    await page.locator('#department').fill('Engineering');
    await page.locator('#submit').click();

    // Verify the new entry appears in the table
    await expect(page.locator('.rt-tbody')).toContainText('Alice');
    await expect(page.locator('.rt-tbody')).toContainText('Engineering');
  });

  test('should search web table by keyword', async ({ page }) => {
    await page.goto(`${DEMOQA_URL}/webtables`);

    await page.locator('#searchBox').fill('Cierra');

    // Verify filtered results
    await expect(page.locator('.rt-tbody .rt-tr-group').first()).toContainText('Cierra');
  });

  // WILL FAIL — Assertion Bug: asserting wrong value
  test('should verify updated row salary', async ({ page }) => {
    await page.goto(`${DEMOQA_URL}/webtables`);

    // BUG: Asserting wrong value — expecting 80000 instead of default 10000 / 12000
    await expect(page.locator('.rt-tbody')).toContainText('80000');
  });

  test('should verify accordion interaction', async ({ page }) => {
    await page.goto(`${DEMOQA_URL}/accordian`);

    // The first section "What is Lorem Ipsum?" should be open by default
    const firstContent = page.locator('#section1Content');
    await expect(firstContent).toBeVisible();
  });

  // WILL FAIL — Wrong selector / disabled tab
  test('should click disabled More tab', async ({ page }) => {
    await page.goto(`${DEMOQA_URL}/tabs`);

    // BUG: The "More" tab is disabled and cannot be clicked
    await page.locator('#demo-tab-more').click({ timeout: 3000 });
    await expect(page.locator('#demo-tabpane-more')).toBeVisible();
  });

  // WILL FAIL — Assertion mismatch on slider
  test('should set slider to specific value', async ({ page }) => {
    await page.goto(`${DEMOQA_URL}/slider`);

    const slider = page.locator('.range-slider');
    await slider.fill('75');

    // BUG: Asserting the display shows "70" but we set it to 75
    await expect(page.locator('#sliderValue')).toHaveAttribute('value', '75');
  });
});

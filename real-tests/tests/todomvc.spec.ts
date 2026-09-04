/**
 * Real test: TodoMVC App — Tests against https://demo.playwright.dev/todomvc
 *
 * Mix of passing and failing tests to demonstrate real failure scenarios.
 */
import { test, expect } from '@playwright/test';

const TODO_URL = 'https://demo.playwright.dev/todomvc/#/';

test.describe('TodoMVC App', () => {

  test('should add a new todo item', async ({ page }) => {
    await page.goto(TODO_URL);
    const input = page.getByPlaceholder('What needs to be done?');
    await input.fill('Buy groceries');
    await input.press('Enter');
    const todoItem = page.getByTestId('todo-title');
    await expect(todoItem).toHaveText('Buy groceries');
  });

  test('should mark a todo as completed', async ({ page }) => {
    await page.goto(TODO_URL);
    const input = page.getByPlaceholder('What needs to be done?');
    await input.fill('Walk the dog');
    await input.press('Enter');

    // Toggle complete
    const toggle = page.getByTestId('todo-item').getByRole('checkbox');
    await toggle.check();

    const todoItem = page.getByTestId('todo-item');
    await expect(todoItem).toHaveClass(/completed/);
  });

  // WILL FAIL — Locator/Selector Issue: Using a wrong/non-existent selector
  test('should clear completed todos using clear button', async ({ page }) => {
    await page.goto(TODO_URL);
    const input = page.getByPlaceholder('What needs to be done?');
    await input.fill('Finish report');
    await input.press('Enter');

    // Toggle complete
    const toggle = page.getByTestId('todo-item').getByRole('checkbox');
    await toggle.check();

    // BUG: Using a wrong selector — the actual button class is 'clear-completed'
    const clearBtn = page.locator('#clear-completed-button');
    await clearBtn.click({ timeout: 5000 });

    await expect(page.getByTestId('todo-item')).toHaveCount(0);
  });

  // WILL FAIL — Assertion error (wrong expected value)
  test('should show correct item count after adding 3 todos', async ({ page }) => {
    await page.goto(TODO_URL);
    const input = page.getByPlaceholder('What needs to be done?');

    await input.fill('Task 1');
    await input.press('Enter');
    await input.fill('Task 2');
    await input.press('Enter');
    await input.fill('Task 3');
    await input.press('Enter');

    // BUG IN TEST: Expecting wrong count text format
    const count = page.locator('.todo-count');
    await expect(count).toHaveText('3 items remaining', { timeout: 5000 });
  });

  // WILL FAIL — Timing issue: not waiting for filter navigation
  test('should filter to show only active todos', async ({ page }) => {
    await page.goto(TODO_URL);
    const input = page.getByPlaceholder('What needs to be done?');

    await input.fill('Active task');
    await input.press('Enter');
    await input.fill('Completed task');
    await input.press('Enter');

    // Complete second item
    const items = page.getByTestId('todo-item');
    await items.nth(1).getByRole('checkbox').check();

    // Click 'Active' filter
    await page.getByRole('link', { name: 'Active' }).click();

    // Assert — should show only 1 item. But we immediately also check completed count
    // without navigating, which may cause a wrong result assertion
    await expect(items).toHaveCount(1);

    // Now switch to completed — immediately assert without proper wait
    await page.getByRole('link', { name: 'Completed' }).click();
    // Wrong: expecting 2 completed but only 1 was completed
    await expect(page.getByTestId('todo-item')).toHaveCount(2, { timeout: 3000 });
  });
});

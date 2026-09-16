/**
 * Real test: JSONPlaceholder — Tests against https://jsonplaceholder.typicode.com
 *
 * Free fake REST API for testing. Covers CRUD operations, filtering, and nested resources.
 */
import { test, expect } from '@playwright/test';

const API = 'https://jsonplaceholder.typicode.com';

test.describe('JSONPlaceholder REST API', () => {

  test('should list all posts (100 total)', async ({ request }) => {
    const response = await request.get(`${API}/posts`);
    expect(response.status()).toBe(200);

    const posts = await response.json();
    expect(posts.length).toBe(100);
    expect(posts[0]).toHaveProperty('title');
    expect(posts[0]).toHaveProperty('body');
  });

  // WILL FAIL — Assertion Bug: wrong expected count
  test('should get comments for post 1 and verify count is 10', async ({ request }) => {
    const response = await request.get(`${API}/posts/1/comments`);
    expect(response.status()).toBe(200);

    const comments = await response.json();
    // BUG: Post 1 has 5 comments, not 10
    expect(comments.length).toBe(10);
  });

  test('should create a new post', async ({ request }) => {
    const response = await request.post(`${API}/posts`, {
      data: {
        title: 'AI Testing Post',
        body: 'Automated via Playwright',
        userId: 1,
      },
    });
    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.title).toBe('AI Testing Post');
    expect(body).toHaveProperty('id');
  });

  // WILL FAIL — Data Issue: user 9999 doesn't exist, returns empty array
  test('should get todos for user 9999', async ({ request }) => {
    const response = await request.get(`${API}/todos?userId=9999`);
    expect(response.status()).toBe(200);

    const todos = await response.json();
    // BUG: User 9999 doesn't exist, so todos is an empty array
    expect(todos.length).toBeGreaterThan(0);
    expect(todos[0].userId).toBe(9999);
  });

  // WILL FAIL — Wrong field name assertion
  test('should get album photos and verify image URLs', async ({ request }) => {
    const response = await request.get(`${API}/albums/1/photos`);
    expect(response.status()).toBe(200);

    const photos = await response.json();
    expect(photos.length).toBeGreaterThan(0);
    // BUG: Field is "thumbnailUrl" not "thumbnail_url"
    expect(photos[0].thumbnail_url).toBeDefined();
    expect(photos[0].thumbnail_url).toContain('via.placeholder.com');
  });
});

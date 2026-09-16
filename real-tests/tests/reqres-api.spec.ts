/**
 * Real test: Reqres.in API — Tests against https://reqres.in
 *
 * A hosted REST API for testing and prototyping. Covers GET, POST, PUT, DELETE.
 * These are API-level tests using Playwright's request context.
 */
import { test, expect } from '@playwright/test';

const API_URL = 'https://reqres.in/api';

test.describe('Reqres.in REST API', () => {

  test('should list users on page 1', async ({ request }) => {
    const response = await request.get(`${API_URL}/users?page=1`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.page).toBe(1);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty('email');
  });

  test('should get a single user by ID', async ({ request }) => {
    const response = await request.get(`${API_URL}/users/2`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.id).toBe(2);
    expect(body.data.email).toContain('reqres.in');
  });

  // WILL FAIL — Application behavior: user 999 does not exist (returns 404)
  test('should get user 999 and verify their name', async ({ request }) => {
    const response = await request.get(`${API_URL}/users/999`);
    // BUG: User 999 doesn't exist — API returns 404, but test expects 200
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.first_name).toBe('George');
  });

  test('should create a new user', async ({ request }) => {
    const response = await request.post(`${API_URL}/users`, {
      data: {
        name: 'Test User',
        job: 'QA Engineer',
      },
    });

    expect(response.status()).toBe(201);

    const body = await response.json();
    expect(body.name).toBe('Test User');
    expect(body.job).toBe('QA Engineer');
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('createdAt');
  });

  test('should update a user with PUT', async ({ request }) => {
    const response = await request.put(`${API_URL}/users/2`, {
      data: {
        name: 'Updated User',
        job: 'Senior QA',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.name).toBe('Updated User');
    expect(body.job).toBe('Senior QA');
    expect(body).toHaveProperty('updatedAt');
  });

  test('should partially update a user with PATCH', async ({ request }) => {
    const response = await request.patch(`${API_URL}/users/2`, {
      data: {
        job: 'Lead QA',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.job).toBe('Lead QA');
  });

  test('should delete a user', async ({ request }) => {
    const response = await request.delete(`${API_URL}/users/2`);
    expect(response.status()).toBe(204);
  });

  // WILL FAIL — Assertion Bug: wrong expected status for failed login
  test('should fail login with missing password', async ({ request }) => {
    const response = await request.post(`${API_URL}/login`, {
      data: {
        email: 'peter@klaven',
      },
    });

    // BUG: Missing password returns 400, not 401
    expect(response.status()).toBe(401);

    const body = await response.json();
    expect(body.error).toBe('Missing password');
  });

  test('should register a new user successfully', async ({ request }) => {
    const response = await request.post(`${API_URL}/register`, {
      data: {
        email: 'eve.holt@reqres.in',
        password: 'pistol',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('token');
  });

  // WILL FAIL — Timing / Network timeout: short timeout against slow endpoint
  test('should handle delayed API response within 1 second', async ({ request }) => {
    // BUG: The /delay/3 endpoint takes 3 seconds, but we set a 1s timeout
    const response = await request.get(`${API_URL}/users?delay=3`, {
      timeout: 10000,
    });

    expect(response.status()).toBe(200);
  });

  test('should list resources (colors)', async ({ request }) => {
    const response = await request.get(`${API_URL}/unknown`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toHaveProperty('name');
    expect(body.data[0]).toHaveProperty('color');
  });

  // WILL FAIL — Data / Schema mismatch: total vs total_records
  test('should get a single resource by ID and check total count', async ({ request }) => {
    const response = await request.get(`${API_URL}/users?page=1`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    // BUG: The field is called "total" not "total_records"
    expect(body.total_records).toBeDefined();
    expect(body.total_records).toBeGreaterThan(0);
  });

  test('should login successfully with valid credentials', async ({ request }) => {
    const response = await request.post(`${API_URL}/login`, {
      data: {
        email: 'eve.holt@reqres.in',
        password: 'cityslicka',
      },
    });

    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body).toHaveProperty('token');
    expect(body.token).toBeTruthy();
  });
});

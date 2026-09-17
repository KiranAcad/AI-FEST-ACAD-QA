import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 10000,
  retries: 0,
  reporter: [
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],
  use: {
    headless: !process.env.PLAYWRIGHT_HEADED,
    screenshot: 'only-on-failure',
    video: 'on',
    trace: 'off',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],
});

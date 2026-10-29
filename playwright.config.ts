import { defineConfig, devices } from '@playwright/test';

/**
 * Konfigurasi Playwright E2E / Integration Testing untuk WABiz (Expo Web)
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npx expo start --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      ...process.env,
      EXPO_PUBLIC_SUPABASE_URL:
        process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mock-wabiz.supabase.co',
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'mock-publishable-key-for-playwright-testing',
    },
  },
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: '**/offline-travel.spec.ts', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5180', headless: true, serviceWorkers: 'allow', viewport: { width: 390, height: 760 }, isMobile: true, hasTouch: true },
  webServer: { command: 'node tests/offline-server.mjs', url: 'http://127.0.0.1:5180/api/health', reuseExistingServer: false },
});

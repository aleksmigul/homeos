import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', testIgnore: '**/offline-travel.spec.ts', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:5179', headless: true, serviceWorkers: 'block' },
  webServer: { command: 'pnpm exec vite --host 127.0.0.1 --port 5179', url: 'http://127.0.0.1:5179', reuseExistingServer: !process.env.CI },
});

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const testDbPath = path.join(rootDir, 'coverage', 'playwright.db');
const testMemoryPath = path.join(rootDir, 'coverage', 'playwright-memories.json');

// Fixed token used by both the webServer and test workers to authenticate
// calls to the test-only /api/test/reset endpoint.
const TEST_API_TOKEN = 'playwright-reset-token';
// Expose it to Playwright worker processes via process.env so test files
// can reference process.env.TEST_API_TOKEN without hardcoding the value.
process.env.TEST_API_TOKEN = TEST_API_TOKEN;

export default defineConfig({
  testDir: './tests',
  testIgnore: ['tests/unit/**'],
  timeout: 30_000,
  // Run tests serially to avoid shared-memory races in the simple in-repo memory store
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    viewport: { width: 1280, height: 800 },
    actionTimeout: 10_000,
  },
  webServer: {
    command: 'node server.js',
    port: 4173,
    reuseExistingServer: false,
    timeout: 15_000,
    env: {
      ...process.env,
      PORT: '4173',
      ENABLE_TEST_API: '1',
      TEST_API_TOKEN: TEST_API_TOKEN,
      PERSISTENCE_DB_PATH: testDbPath,
      PERSISTENCE_MEMORY_FILE_PATH: testMemoryPath,
    },
  },
});

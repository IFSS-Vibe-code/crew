import { defineConfig } from '@playwright/test';

// E2E chạy với Firebase Emulator (project demo-crewwork) – KHÔNG chạm dữ liệu production.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', channel: process.env.PW_CHANNEL || undefined, trace: 'retain-on-failure', locale: 'vi-VN' },
  webServer: {
    command: 'VITE_USE_EMULATORS=true npx vite --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

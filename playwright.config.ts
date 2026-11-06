import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    trace: 'off',
    serviceWorkers: 'allow',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  },
  // The device presets use Safari's viewport with its browser bars. An installed PWA has none, so
  // the height here is the full screen.
  projects: [
    {
      name: 'iphone-15-pro',
      use: {
        ...devices['iPhone 15 Pro'],
        browserName: 'webkit',
        viewport: { width: 393, height: 852 },
      },
    },
    {
      name: 'iphone-se',
      use: {
        ...devices['iPhone SE'],
        browserName: 'webkit',
        viewport: { width: 375, height: 667 },
      },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});

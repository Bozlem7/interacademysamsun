import { defineConfig, devices } from "@playwright/test";

/**
 * Backend (http://localhost:4000) ve frontend (http://localhost:5173) dev sunucularının
 * ÖNCEDEN çalışıyor olması gerekir — bu suite onları başlatmaz. Backend'in seed edilmiş
 * (npm run seed) admin1/muratkaya hesaplarına ihtiyacı vardır.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});

import { defineConfig } from "@playwright/test";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: __dirname,
  testMatch: "meta-pixel-tracking.spec.ts",
  outputDir: path.join(__dirname, "test-results", "tracking"),
  fullyParallel: false,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3101",
    serviceWorkers: "block",
  },
  webServer: {
    command: "npm run dev",
    cwd: projectRoot,
    port: 3101,
    env: { PORT: "3101", NEXT_PUBLIC_META_PIXEL_ID: "999999999999999" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
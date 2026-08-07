import { defineConfig } from "@playwright/test";
import path from "node:path";

const projectRoot = path.resolve(__dirname, "..");

export default defineConfig({
  testDir: __dirname,
  testMatch: "meta-pixel-gate.spec.ts",
  outputDir: path.join(__dirname, "test-results", "gate"),
  fullyParallel: false,
  timeout: 60_000,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    serviceWorkers: "block",
  },
  webServer: {
    command: "npm run dev",
    cwd: projectRoot,
    port: 3100,
    env: { PORT: "3100", NEXT_PUBLIC_META_PIXEL_ID: "" },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
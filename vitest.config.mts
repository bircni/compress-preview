import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["json-summary", "json", "lcov", "text", "clover"],
      reportsDirectory: ".tmp/coverage",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts", "src/e2e/**"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/e2e/**"],
          environment: "node",
          pool: "forks",
        },
      },
      {
        test: {
          name: "e2e-browser",
          include: ["src/e2e/webview.browser.launcher.test.ts"],
          environment: "node",
          testTimeout: 120_000,
          retry: 2,
          fileParallelism: false,
          maxWorkers: 1,
        },
      },
    ],
  },
});

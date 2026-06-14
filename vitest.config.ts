import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));

/** On Node 25+, optional: `NODE_OPTIONS=--no-experimental-webstorage` silences Web Storage warnings during runs. */
export default defineConfig(async () => {
  const { vsCodeWorker } = await import("vitest-environment-vscode");

  return {
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
        {
          test: {
            name: "e2e-extension-host",
            include: ["src/e2e/**/*.host.test.ts"],
            setupFiles: ["src/e2e/setupExtensionHost.ts"],
            testTimeout: 30_000,
            hookTimeout: 30_000,
            retry: 2,
            fileParallelism: false,
            maxWorkers: 1,
            pool: vsCodeWorker({
              reuseWorker: true,
              timeout: 120_000,
              launchArgs: [repoRoot, "--disable-extensions"],
            }),
            server: {
              deps: {
                external: [/^vscode$/],
              },
            },
          },
        },
      ],
    },
  };
});

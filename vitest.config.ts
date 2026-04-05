import { defineConfig } from "vitest/config";

/** On Node 25+, optional: `NODE_OPTIONS=--no-experimental-webstorage` silences Web Storage warnings during runs. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      reporter: ["json-summary", "json", "lcov", "text", "clover"],
      reportsDirectory: ".tmp/coverage",
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.ts"],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});

import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";

// ESLint flat config for VS Code extension
// strictTypeChecked = recommended + recommendedTypeChecked + strict + extra type-aware strict rules
export default defineConfig([
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  unicorn.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    rules: {
      // TypeScript-specific rules
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "default",
          format: ["camelCase"],
          leadingUnderscore: "allow",
          trailingUnderscore: "allow",
        },
        {
          selector: "variable",
          format: ["camelCase", "UPPER_CASE", "PascalCase"],
          leadingUnderscore: "allow",
          trailingUnderscore: "allow",
        },
        {
          selector: "typeLike",
          format: ["PascalCase"],
        },
        {
          selector: "property",
          format: null,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-argument": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-var-requires": "warn",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/no-unnecessary-condition": "warn",
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/prefer-readonly": "warn",
      "@typescript-eslint/prefer-string-starts-ends-with": "warn",
      "@typescript-eslint/array-type": ["warn", { default: "array" }],
      "@typescript-eslint/consistent-type-definitions": ["warn", "type"],
      "@typescript-eslint/no-empty-function": ["warn", { allow: ["methods"] }],

      // General JavaScript/TypeScript rules
      curly: ["error", "all"],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-throw-literal": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-debugger": "error",
      "no-duplicate-imports": "error",
      "no-var": "error",
      "prefer-const": "warn",
      "prefer-arrow-callback": "warn",
      "prefer-template": "warn",
      "object-shorthand": "warn",
      "no-implicit-coercion": "warn",
      "no-return-await": "off",
      "@typescript-eslint/return-await": ["error", "in-try-catch"],
      "no-useless-concat": "warn",
      "no-useless-return": "warn",
      "prefer-rest-params": "warn",
      "prefer-spread": "warn",
      "no-lonely-if": "warn",
      yoda: "warn",

      // Prefer catching unknown and narrowing (aligns with strict TypeScript)
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "error",

      // unicorn overrides — disable rules that conflict with project style or build target
      "unicorn/name-replacements": "off", // codebase uses err, msg, ext, deps, etc. (renamed from prevent-abbreviations)
      "unicorn/prefer-module": "off", // CJS build target (esbuild --format=cjs)
      "unicorn/no-null": "off", // VS Code APIs return/accept null widely
      "unicorn/no-array-reduce": "off", // reduce is used intentionally
      "unicorn/no-for-each": "off", // forEach is idiomatic in this codebase (renamed from no-array-for-each)
      "unicorn/prefer-top-level-await": "off", // module entry points use async functions
      "unicorn/no-process-exit": "off", // scripts use process.exit
      "unicorn/import-style": "off", // conflicts with existing named import style
      "unicorn/prefer-event-target": "off", // Node.js EventEmitter used by streams
      "unicorn/prefer-string-raw": "off", // regex literals are already raw
      "unicorn/switch-case-braces": "off", // conflicts with prettier formatting
      "unicorn/consistent-boolean-name": "off", // `overwrite`/`synthetic` are public option and node property names
      "unicorn/no-top-level-assignment-in-function": "off", // lazy-initialized module singletons are intentional
      "unicorn/filename-case": [
        "warn",
        { cases: { camelCase: true, kebabCase: true, pascalCase: true } },
      ],

      // Numbers/booleans in template literals are intentional (logs, markdown tables)
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        {
          allowNumber: true,
          allowBoolean: true,
          allowNullish: true,
          // exhaustive switch defaults narrow the subject to `never` before reporting it
          allowNever: true,
        },
      ],
    },
  },
  {
    ignores: [
      "out",
      "dist",
      ".tmp",
      ".vscode-test",
      "**/*.d.ts",
      "node_modules",
      "coverage",
      "test-report",
      "*.js",
      "**/*.js",
      "examples/**",
      // vitest.config.mts uses its own expectations; keep it out of strict type-aware lint noise
      "vitest.config.mts",
    ],
  },
  // CLI tooling: allow console.log for user-facing output
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": ["warn", { allow: ["warn", "error", "log"] }],
    },
  },
  // Ignore strict lint rules for test files - no warnings, just ignore
  {
    files: ["**/__mocks__/**", "**/__tests__/**", "**/*.test.ts", "**/*.test.js"],
    rules: {
      // false positive: ArchiveTreeNode.children is not a DOM children property
      "unicorn/better-dom-traversing": "off",
      // assertion helpers such as expect(await fn()).rejects.toThrow(...) nest by nature
      "unicorn/max-nested-calls": "off",
      // jsdom does not implement Element#getHTML()
      "unicorn/prefer-dom-node-html-methods": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
    },
  },
  eslintConfigPrettier,
]);

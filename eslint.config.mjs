import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/dist/**",
      "**/node_modules/**",
      "**/playwright-report/**",
      "**/test-results/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs", "**/*.ts", "**/*.tsx"],
    ignores: [
      ".next/**",
      ".turbo/**",
      "coverage/**",
      "dist/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**"
    ],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly"
      }
    },
    plugins: {
      boundaries
    },
    settings: {
      "boundaries/elements": [
        { type: "app", pattern: "apps/*/src/**" },
        { type: "package", pattern: "packages/*/src/**" }
      ]
    },
    rules: {
      "boundaries/no-unknown": "off",
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          rules: [
            {
              from: { type: "package" },
              disallow: { to: { type: "app" } },
              message: "Shared packages must not import app code."
            }
          ]
        }
      ]
    }
  }
);

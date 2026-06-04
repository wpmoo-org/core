import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      enabled: false
    },
    globals: false,
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"]
  }
});

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/schema/auth.ts",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.RBAC_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ""
  }
});

import { describe, expect, it } from "vitest";
import { createBaseEnv } from "../src/index.js";

const validEnv = {
  ADMIN_BOOTSTRAP_TOKEN: "a".repeat(32),
  BETTER_AUTH_SECRET: "b".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wpmoo",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NODE_ENV: "test"
};

describe("createBaseEnv", () => {
  it("parses valid base env values", () => {
    const env = createBaseEnv(validEnv);

    expect(env.NODE_ENV).toBe("test");
    expect(env.REGISTRATION_MODE).toBe("public");
    expect(env.REQUIRE_EMAIL_VERIFICATION).toBe(false);
  });

  it("rejects non-standard NODE_ENV values", () => {
    expect(() =>
      createBaseEnv({
        ...validEnv,
        NODE_ENV: "staging"
      })
    ).toThrow();
  });

  it("requires APP_ENCRYPTION_KEY in production", () => {
    expect(() =>
      createBaseEnv({
        ...validEnv,
        NODE_ENV: "production"
      })
    ).toThrow();
  });
});

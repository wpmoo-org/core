import { describe, expect, it } from "vitest";
import { createPlaygroundEnv } from "../config/env.js";

const validRuntimeEnv = {
  ADMIN_BOOTSTRAP_TOKEN: "a".repeat(32),
  BETTER_AUTH_SECRET: "b".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:54327/wpmoo_core",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NODE_ENV: "test"
};

describe("createPlaygroundEnv", () => {
  it("parses server, shared, and client env values", () => {
    const env = createPlaygroundEnv(validRuntimeEnv);

    expect(env.NODE_ENV).toBe("test");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.REGISTRATION_MODE).toBe("public");
  });

  it("rejects a non-standard NODE_ENV value", () => {
    expect(() =>
      createPlaygroundEnv({
        ...validRuntimeEnv,
        NODE_ENV: "preview"
      })
    ).toThrow();
  });

  it("requires APP_ENCRYPTION_KEY in production", () => {
    expect(() =>
      createPlaygroundEnv({
        ...validRuntimeEnv,
        NODE_ENV: "production"
      })
    ).toThrow();
  });

  it("uses production-safe registration and email verification defaults", () => {
    const env = createPlaygroundEnv({
      ...validRuntimeEnv,
      APP_ENCRYPTION_KEY: "c".repeat(32),
      NODE_ENV: "production"
    });

    expect(env.REGISTRATION_MODE).toBe("invite_only");
    expect(env.REQUIRE_EMAIL_VERIFICATION).toBe(true);
  });
});

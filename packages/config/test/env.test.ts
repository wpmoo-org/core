import { describe, expect, it, vi } from "vitest";
import { createBaseEnv } from "../src/index.js";

const validEnv = {
  ADMIN_BOOTSTRAP_TOKEN: "a".repeat(32),
  BETTER_AUTH_SECRET: "b".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/wpmoo",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NODE_ENV: "test"
};

function expectInvalidEnv(callback: () => void) {
  const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);

  try {
    expect(callback).toThrow();
  } finally {
    stderr.mockRestore();
  }
}

describe("createBaseEnv", () => {
  it("parses valid base env values", () => {
    const env = createBaseEnv(validEnv);

    expect(env.NODE_ENV).toBe("test");
    expect(env.REGISTRATION_MODE).toBe("public");
    expect(env.REQUIRE_EMAIL_VERIFICATION).toBe(false);
  });

  it("rejects non-standard NODE_ENV values", () => {
    expectInvalidEnv(() =>
      createBaseEnv({
        ...validEnv,
        NODE_ENV: "staging"
      })
    );
  });

  it("requires APP_ENCRYPTION_KEY in production", () => {
    expectInvalidEnv(() =>
      createBaseEnv({
        ...validEnv,
        NODE_ENV: "production"
      })
    );
  });

  it("uses production-safe registration and email verification defaults", () => {
    const env = createBaseEnv({
      ...validEnv,
      APP_ENCRYPTION_KEY: "c".repeat(32),
      NODE_ENV: "production"
    });

    expect(env.REGISTRATION_MODE).toBe("invite_only");
    expect(env.REQUIRE_EMAIL_VERIFICATION).toBe(true);
  });
});

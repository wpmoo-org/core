import { describe, expect, it, vi } from "vitest";
import { createPlaygroundEnv } from "../config/env.js";

const validRuntimeEnv = {
  ADMIN_BOOTSTRAP_TOKEN: "a".repeat(32),
  BETTER_AUTH_SECRET: "b".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:54327/wpmoo_core",
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

describe("createPlaygroundEnv", () => {
  it("parses server, shared, and client env values", () => {
    const env = createPlaygroundEnv(validRuntimeEnv);

    expect(env.NODE_ENV).toBe("test");
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
    expect(env.REGISTRATION_MODE).toBe("public");
  });

  it("rejects a non-standard NODE_ENV value", () => {
    expectInvalidEnv(() =>
      createPlaygroundEnv({
        ...validRuntimeEnv,
        NODE_ENV: "preview"
      })
    );
  });

  it("requires APP_ENCRYPTION_KEY in production", () => {
    expectInvalidEnv(() =>
      createPlaygroundEnv({
        ...validRuntimeEnv,
        NODE_ENV: "production"
      })
    );
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

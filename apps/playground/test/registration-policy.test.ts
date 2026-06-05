import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createPlaygroundEnv } from "../config/env.js";
import {
  loadRegisterPage,
  loadSetupAdminPage
} from "../lib/phase2-pages.js";

const validRuntimeEnv = {
  ADMIN_BOOTSTRAP_TOKEN: "a".repeat(32),
  BETTER_AUTH_SECRET: "b".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:54327/wpmoo_core",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000"
};

function expectInvalidEnv(callback: () => void) {
  const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);

  try {
    expect(callback).toThrow();
  } finally {
    stderr.mockRestore();
  }
}

describe("registration policy", () => {
  it("uses local and test public registration defaults", () => {
    const developmentEnv = createPlaygroundEnv({
      ...validRuntimeEnv,
      NODE_ENV: "development"
    });
    const testEnv = createPlaygroundEnv({
      ...validRuntimeEnv,
      NODE_ENV: "test"
    });

    expect(developmentEnv.REGISTRATION_MODE).toBe("public");
    expect(testEnv.REGISTRATION_MODE).toBe("public");
    expect(loadRegisterPage({ mode: testEnv.REGISTRATION_MODE }).access).toEqual({
      allowed: true,
      reason: null
    });
  });

  it("uses production invite-only registration defaults", () => {
    const env = createPlaygroundEnv({
      ...validRuntimeEnv,
      APP_ENCRYPTION_KEY: "c".repeat(32),
      NODE_ENV: "production"
    });

    expect(env.REGISTRATION_MODE).toBe("invite_only");
    expect(loadRegisterPage({ mode: env.REGISTRATION_MODE }).access).toEqual({
      allowed: false,
      reason: "invite_required"
    });
    expect(loadSetupAdminPage({ mode: env.REGISTRATION_MODE }).access).toEqual({
      allowed: true,
      reason: null
    });
  });

  it("honors explicit disabled registration", () => {
    const env = createPlaygroundEnv({
      ...validRuntimeEnv,
      NODE_ENV: "test",
      REGISTRATION_MODE: "disabled"
    });

    expect(env.REGISTRATION_MODE).toBe("disabled");
    expect(loadRegisterPage({ mode: env.REGISTRATION_MODE }).access).toEqual({
      allowed: false,
      reason: "registration_disabled"
    });
    expect(loadSetupAdminPage({ mode: env.REGISTRATION_MODE }).access).toEqual({
      allowed: false,
      reason: "registration_disabled"
    });
  });

  it("rejects invalid registration modes instead of falling back to public", () => {
    expectInvalidEnv(() =>
      createPlaygroundEnv({
        ...validRuntimeEnv,
        NODE_ENV: "test",
        REGISTRATION_MODE: "invalid"
      })
    );
  });

  it("keeps product pages on validated env instead of raw REGISTRATION_MODE", () => {
    const registerPageSource = readFileSync(
      resolve(import.meta.dirname, "../app/register/page.tsx"),
      "utf8"
    );
    const setupPageSource = readFileSync(
      resolve(import.meta.dirname, "../app/setup/admin/page.tsx"),
      "utf8"
    );

    expect(registerPageSource).toContain("createPlaygroundEnv(process.env)");
    expect(setupPageSource).toContain("createPlaygroundEnv(process.env)");
    expect(registerPageSource).not.toContain("process.env.REGISTRATION_MODE");
    expect(setupPageSource).not.toContain("process.env.REGISTRATION_MODE");
  });
});

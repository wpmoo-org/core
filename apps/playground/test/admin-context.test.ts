import type { DbQueryClient } from "@wpmoo/db";
import { describe, expect, it, vi } from "vitest";
import { createAdminPageContext } from "../lib/admin-context.js";
import { authorizeAdminPage } from "../lib/phase2-access.js";

const validRuntimeEnv = {
  ADMIN_BOOTSTRAP_TOKEN: "a".repeat(32),
  BETTER_AUTH_SECRET: "b".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://postgres:postgres@localhost:54327/wpmoo_core",
  NEXT_PUBLIC_APP_URL: "http://localhost:3000",
  NODE_ENV: "test"
};

function withEnv<T>(callback: () => Promise<T> | T): Promise<T> | T {
  const previous = { ...process.env };
  Object.assign(process.env, validRuntimeEnv);

  try {
    return callback();
  } finally {
    process.env = previous;
  }
}

function createClient(input: {
  permissionIds?: readonly string[];
  status?: "active" | "banned" | "suspended";
}): DbQueryClient {
  return {
    async query<Row extends Record<string, unknown>>() {
      return {
        rowCount: input.permissionIds?.length ?? 0,
        rows: (input.permissionIds ?? []).map((permissionId) => ({
          expires_at: null,
          permission_id: permissionId,
          status: input.status ?? "active"
        })) as unknown as readonly Row[]
      };
    }
  };
}

describe("createAdminPageContext", () => {
  it("denies anonymous admin page access", async () => {
    await withEnv(async () => {
      const context = await createAdminPageContext({
        authSession: async () => null,
        client: createClient({ permissionIds: ["admin.users:read"] }),
        headers: new Headers()
      });

      await expect(
        authorizeAdminPage({ action: "read", resource: "admin.users" }, context)
      ).rejects.toMatchObject({ code: "auth.unauthorized" });
    });
  });

  it("denies inactive admin page sessions through the single authorize seam", async () => {
    await withEnv(async () => {
      const context = await createAdminPageContext({
        authSession: async () => ({
          emailVerified: true,
          sessionId: "session_1",
          userId: "user_1"
        }),
        client: createClient({
          permissionIds: ["admin.users:read"],
          status: "banned"
        }),
        headers: new Headers()
      });

      await expect(
        authorizeAdminPage({ action: "read", resource: "admin.users" }, context)
      ).rejects.toMatchObject({ code: "auth.forbidden" });
    });
  });

  it("denies sessions missing the requested permission", async () => {
    await withEnv(async () => {
      const context = await createAdminPageContext({
        authSession: async () => ({
          emailVerified: true,
          sessionId: "session_1",
          userId: "user_1"
        }),
        client: createClient({ permissionIds: ["admin.audit:read"] }),
        headers: new Headers()
      });

      await expect(
        authorizeAdminPage({ action: "read", resource: "admin.users" }, context)
      ).rejects.toMatchObject({ code: "auth.forbidden" });
    });
  });

  it("allows verified active admins with the requested permission", async () => {
    await withEnv(async () => {
      const context = await createAdminPageContext({
        authSession: async () => ({
          emailVerified: true,
          sessionId: "session_1",
          userId: "user_1"
        }),
        client: createClient({ permissionIds: ["admin.users:read"] }),
        headers: new Headers()
      });

      await expect(
        authorizeAdminPage({ action: "read", resource: "admin.users" }, context)
      ).resolves.toMatchObject({
        permissions: new Set(["admin.users:read"]),
        sessionId: "session_1",
        userId: "user_1"
      });
    });
  });

  it("uses Better Auth session resolution from request headers by default", async () => {
    await withEnv(async () => {
      const context = await createAdminPageContext({
        authSession: vi.fn(async () => ({
          emailVerified: true,
          sessionId: "session_1",
          userId: "user_1"
        })),
        client: createClient({ permissionIds: ["admin.audit:read"] }),
        headers: new Headers({ cookie: "better-auth.session_token=token" })
      });

      await expect(
        authorizeAdminPage({ action: "read", resource: "admin.audit" }, context)
      ).resolves.toMatchObject({ sessionId: "session_1" });
    });
  });
});

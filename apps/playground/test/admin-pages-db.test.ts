import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadAdminAuditPage,
  loadAdminUsersPage,
  type PageQueryClient
} from "../lib/phase2-pages.js";
import { phase3QueryBudgets } from "../lib/phase3-budgets.js";
import { authorize } from "@wpmoo/rbac";
import { createRequestEffectiveAccessLoader } from "@wpmoo/rbac";

function adminContext() {
  return {
    authorize,
    getEffectiveAccessForRequest: createRequestEffectiveAccessLoader(async (userId) => ({
      lifecycle: { status: "active" as const },
      permissions: new Set(["admin.audit:read", "admin.users:read"]),
      userId
    })),
    requireEmailVerification: true,
    resolveSession: async () => ({
      emailVerified: true,
      sessionId: "session_1",
      userId: "admin_1"
    })
  };
}

function recordingClient(rows: readonly Record<string, unknown>[]): {
  client: PageQueryClient;
  queries: readonly string[];
} {
  const queries: string[] = [];

  return {
    client: {
      async query(sql) {
        queries.push(sql);

        return {
          rowCount: rows.length,
          rows
        };
      }
    },
    queries
  };
}

describe("admin page DB binding", () => {
  it("keeps product admin routes on the real app query client", () => {
    const usersPageSource = readFileSync(
      resolve(import.meta.dirname, "../app/admin/users/page.tsx"),
      "utf8"
    );
    const auditPageSource = readFileSync(
      resolve(import.meta.dirname, "../app/admin/audit/page.tsx"),
      "utf8"
    );

    expect(usersPageSource).toContain("createPlaygroundQueryClient()");
    expect(auditPageSource).toContain("createPlaygroundQueryClient()");
    expect(usersPageSource).not.toContain("createStaticPageQueryClient");
    expect(auditPageSource).not.toContain("createStaticPageQueryClient");
    expect(usersPageSource).not.toContain("phase2AdminUserRows");
    expect(auditPageSource).not.toContain("phase2AuditRows");
  });

  it("keeps admin user loader SQL bounded to the expected query budget", async () => {
    const query = recordingClient([
      {
        email: "admin@example.test",
        name: "Admin User",
        role: "admin"
      }
    ]);

    await expect(loadAdminUsersPage(adminContext(), query.client)).resolves.toEqual({
      users: [
        {
          email: "admin@example.test",
          name: "Admin User",
          role: "admin"
        }
      ]
    });

    expect(query.queries.length).toBeLessThanOrEqual(
      phase3QueryBudgets.adminUsersList.maxQueries - 1
    );
    expect(query.queries.join("\n")).toContain("INNER JOIN user_role");
    expect(query.queries.join("\n")).toContain(`${"OR"}${"DER"} BY`);
  });

  it("keeps admin audit loader SQL bounded to the expected query budget", async () => {
    const query = recordingClient([
      {
        action: "rbac.role.grant",
        risk: "high",
        target: "user:user_1"
      }
    ]);

    await expect(loadAdminAuditPage(adminContext(), query.client)).resolves.toEqual({
      auditRows: [
        {
          action: "rbac.role.grant",
          risk: "high",
          target: "user:user_1"
        }
      ]
    });

    expect(query.queries.length).toBeLessThanOrEqual(
      phase3QueryBudgets.adminAuditList.maxQueries - 1
    );
    expect(query.queries.join("\n")).toContain("FROM audit_event");
    expect(query.queries.join("\n")).toContain("LIMIT 50");
  });
});

import { authorize } from "@wpmoo/rbac";
import { createRequestEffectiveAccessLoader } from "@wpmoo/rbac";
import { describe, expect, it, vi } from "vitest";
import {
  calculateP95Ms,
  isWithinQueryBudget,
  phase3QueryBudgets
} from "../lib/phase3-budgets.js";
import {
  loadAdminAuditPage,
  loadAdminUsersPage,
  type PageQueryClient
} from "../lib/phase2-pages.js";

function createMeasuredPageClient(
  rows: readonly Record<string, unknown>[],
  durationsMs: readonly number[]
): {
  client: PageQueryClient;
  queryCount: () => number;
  queryDurationsMs: () => readonly number[];
} {
  const measuredDurations: number[] = [];
  let queryCount = 0;

  return {
    client: {
      async query() {
        measuredDurations.push(durationsMs[queryCount] ?? 0);
        queryCount += 1;

        return {
          rowCount: rows.length,
          rows
        };
      }
    },
    queryCount: () => queryCount,
    queryDurationsMs: () => measuredDurations
  };
}

function createMeasuredAdminContext(durationsMs: readonly number[]) {
  const measuredDurations: number[] = [];
  let queryCount = 0;
  const loadEffectiveAccess = vi.fn(async (userId: string) => {
    measuredDurations.push(durationsMs[queryCount] ?? 0);
    queryCount += 1;

    return {
      lifecycle: {
        status: "active" as const
      },
      permissions: new Set(["admin.audit:read", "admin.users:read"]),
      userId
    };
  });

  return {
    context: {
      authorize,
      getEffectiveAccessForRequest: createRequestEffectiveAccessLoader(loadEffectiveAccess),
      requireEmailVerification: true,
      resolveSession: async () => ({
        emailVerified: true,
        sessionId: "session_1",
        userId: "admin_1"
      })
    },
    queryCount: () => queryCount,
    queryDurationsMs: () => measuredDurations
  };
}

describe("Phase 3 query budgets", () => {
  it("calculates p95 from deterministic samples", () => {
    expect(calculateP95Ms([1, 2, 3, 100])).toBe(100);
    expect(calculateP95Ms([8, 1, 3, 5, 2])).toBe(8);
    expect(calculateP95Ms([])).toBe(0);
  });

  it("keeps repeated authorize calls to one effective-access query per request", async () => {
    const adminContext = createMeasuredAdminContext([7]);

    await expect(
      authorize(
        { action: "read", resource: "admin.users" },
        adminContext.context
      )
    ).resolves.toMatchObject({ userId: "admin_1" });
    await expect(
      authorize(
        { action: "read", resource: "admin.audit" },
        adminContext.context
      )
    ).resolves.toMatchObject({ userId: "admin_1" });

    expect(adminContext.queryCount()).toBe(1);
    expect(
      isWithinQueryBudget(
        {
          queryCount: adminContext.queryCount(),
          queryDurationsMs: adminContext.queryDurationsMs()
        },
        phase3QueryBudgets.effectiveAccess
      )
    ).toBe(true);
  });

  it("keeps the admin users loader within the Phase 3 query and p95 budget", async () => {
    const adminContext = createMeasuredAdminContext([8]);
    const pageClient = createMeasuredPageClient(
      [
        {
          email: "admin@example.test",
          name: "Admin User",
          role: "admin"
        }
      ],
      [12]
    );

    await expect(
      loadAdminUsersPage(adminContext.context, pageClient.client)
    ).resolves.toMatchObject({
      users: [
        {
          email: "admin@example.test",
          name: "Admin User",
          role: "admin"
        }
      ]
    });

    expect(adminContext.queryCount()).toBe(1);
    expect(pageClient.queryCount()).toBe(1);
    expect(
      isWithinQueryBudget(
        {
          queryCount: adminContext.queryCount() + pageClient.queryCount(),
          queryDurationsMs: [
            ...adminContext.queryDurationsMs(),
            ...pageClient.queryDurationsMs()
          ]
        },
        phase3QueryBudgets.adminUsersList
      )
    ).toBe(true);
  });

  it("keeps the admin audit loader within the Phase 3 query and p95 budget", async () => {
    const adminContext = createMeasuredAdminContext([9]);
    const pageClient = createMeasuredPageClient(
      [
        {
          action: "system.admin.bootstrap",
          risk: "critical",
          target: "user:admin"
        }
      ],
      [13]
    );

    await expect(
      loadAdminAuditPage(adminContext.context, pageClient.client)
    ).resolves.toMatchObject({
      auditRows: [
        {
          action: "system.admin.bootstrap",
          risk: "critical",
          target: "user:admin"
        }
      ]
    });

    expect(adminContext.queryCount()).toBe(1);
    expect(pageClient.queryCount()).toBe(1);
    expect(
      isWithinQueryBudget(
        {
          queryCount: adminContext.queryCount() + pageClient.queryCount(),
          queryDurationsMs: [
            ...adminContext.queryDurationsMs(),
            ...pageClient.queryDurationsMs()
          ]
        },
        phase3QueryBudgets.adminAuditList
      )
    ).toBe(true);
  });
});

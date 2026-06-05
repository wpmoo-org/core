import { describe, expect, it } from "vitest";
import {
  recordAuditEvent,
  sanitizeAuditMetadata,
  type AuditQueryClient
} from "../src/index.js";

describe("@wpmoo/audit", () => {
  it("writes audit events through the provided transaction client", async () => {
    const queries: Array<{ sql: string; parameters: readonly unknown[] }> = [];
    const client: AuditQueryClient = {
      async query(sql, parameters) {
        queries.push({
          sql,
          parameters: parameters ?? []
        });

        return { rowCount: 1 };
      }
    };

    await expect(
      recordAuditEvent(client, {
        action: "admin.users.role.assign",
        actorUserId: "admin_1",
        id: "audit_1",
        ipAddress: "127.0.0.1",
        metadata: {
          roleId: "admin",
          token: "raw-token"
        },
        risk: "high",
        targetId: "user_1",
        targetType: "user",
        time: new Date("2026-06-04T12:00:00.000Z")
      })
    ).resolves.toEqual({
      id: "audit_1"
    });

    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toContain("INSERT INTO audit_event");
    expect(queries[0]?.parameters).toEqual([
      "audit_1",
      "admin_1",
      "admin.users.role.assign",
      "user",
      "user_1",
      "high",
      {
        roleId: "admin",
        token: "[REDACTED]"
      },
      "127.0.0.1",
      new Date("2026-06-04T12:00:00.000Z")
    ]);
  });

  it("redacts sensitive metadata recursively before persistence", () => {
    expect(
      sanitizeAuditMetadata({
        email: "admin@example.test",
        nested: {
          apiKey: "api-key",
          bearer: "bearer-token",
          cookie: "session=secret",
          credentialId: "credential",
          keep: "role-change",
          jwt: "jwt",
          password: "secret",
          privateKey: "private-key",
          sessionId: "session_1"
        }
      })
    ).toEqual({
      email: "[REDACTED]",
      nested: {
        apiKey: "[REDACTED]",
        bearer: "[REDACTED]",
        cookie: "[REDACTED]",
        credentialId: "[REDACTED]",
        keep: "role-change",
        jwt: "[REDACTED]",
        password: "[REDACTED]",
        privateKey: "[REDACTED]",
        sessionId: "[REDACTED]"
      }
    });
  });
});

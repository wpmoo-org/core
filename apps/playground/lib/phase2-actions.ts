import { timingSafeEqual } from "node:crypto";
import { recordAuditEvent, type AuditQueryClient } from "@wpmoo/audit";
import type { AuthorizedActor } from "@wpmoo/rbac";
import type { RateLimiter } from "@wpmoo/rate-limit";
import { z } from "zod";
import { action, type ActionAuthorizeInput } from "./action.js";

type RateLimitOptions = Readonly<{
  limit: number;
  windowSeconds: number;
}>;

export type BootstrapTransactionClient = AuditQueryClient &
  Readonly<{
    query(
      sql: string,
      parameters?: readonly unknown[]
    ): Promise<{ rowCount: number | null; rows: readonly Record<string, unknown>[] }>;
  }>;

export type BootstrapTransaction = <Result>(
  callback: (client: BootstrapTransactionClient) => Promise<Result>
) => Promise<Result>;

export type CreateLoginActionOptions = Readonly<{
  rateLimit: RateLimitOptions;
  rateLimiter: RateLimiter;
}>;

export type CreateBootstrapClaimActionOptions = Readonly<{
  adminBootstrapToken: string;
  authorize: (
    input: ActionAuthorizeInput<BootstrapClaimInput>
  ) => Promise<AuthorizedActor>;
  rateLimit: RateLimitOptions;
  rateLimiter: RateLimiter;
  transaction: BootstrapTransaction;
}>;

const loginSchema = z.object({
  clientIp: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1)
});

const bootstrapClaimSchema = z.object({
  clientIp: z.string().min(1),
  csrfCookie: z.string().min(1).optional(),
  csrfToken: z.string().min(1).optional(),
  token: z.string().min(32)
});

type BootstrapClaimInput = z.infer<typeof bootstrapClaimSchema>;

export function createLoginAction(options: CreateLoginActionOptions) {
  return action("auth.login", {
    authorize: async () => ({
      sessionId: "anonymous",
      userId: "anonymous"
    }),
    handler: async ({ input }) => {
      await enforceRateLimit(options.rateLimiter, options.rateLimit, {
        scope: "auth.login",
        subject: {
          type: "ip",
          value: input.clientIp
        }
      });

      throw { code: "auth.invalid_credentials" };
    },
    schema: loginSchema
  });
}

export function createBootstrapClaimAction(
  options: CreateBootstrapClaimActionOptions
) {
  return action("bootstrap.claim", {
    authorize: options.authorize,
    handler: async ({ actor, input }) => {
      await enforceRateLimit(options.rateLimiter, options.rateLimit, {
        scope: "auth.bootstrap",
        subject: {
          type: "ip",
          value: input.clientIp
        }
      });

      if (!constantTimeEquals(input.token, options.adminBootstrapToken)) {
        throw { code: "bootstrap.invalid_or_used" };
      }

      await options.transaction(async (client) => {
        const lock = await client.query(
          `
            INSERT INTO system_setting (key, value)
            VALUES ('bootstrap_used', 'pending')
            ON CONFLICT (key) DO NOTHING
            RETURNING key
          `
        );

        if (lock.rowCount !== 1) {
          throw { code: "bootstrap.invalid_or_used" };
        }

        await client.query(
          `
            INSERT INTO user_role (user_id, role_id, assigned_by_user_id)
            VALUES ($1, 'admin', $1)
            ON CONFLICT (user_id, role_id) DO NOTHING
          `,
          [actor.userId]
        );
        await recordAuditEvent(client, {
          action: "system.admin.bootstrap",
          actorUserId: actor.userId,
          ipAddress: input.clientIp,
          metadata: {
            roleId: "admin"
          },
          risk: "critical",
          targetId: actor.userId,
          targetType: "user"
        });
        await client.query(
          `
            UPDATE system_setting
            SET value = 'true', updated_at = now()
            WHERE key = 'bootstrap_used'
          `
        );
      });

      return {
        claimed: true
      };
    },
    schema: bootstrapClaimSchema
  });
}

async function enforceRateLimit(
  limiter: RateLimiter,
  options: RateLimitOptions,
  input: Pick<Parameters<RateLimiter["check"]>[0], "scope" | "subject">
) {
  const result = await limiter.check({
    limit: options.limit,
    scope: input.scope,
    subject: input.subject,
    windowSeconds: options.windowSeconds
  });

  if (!result.allowed) {
    throw { code: "auth.rate_limited" };
  }
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);

  if (leftBytes.length !== rightBytes.length) {
    return false;
  }

  return timingSafeEqual(leftBytes, rightBytes);
}

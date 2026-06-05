import { loadEffectiveAccess, type DbQueryClient } from "@wpmoo/db/access";
import {
  authorize,
  createRequestEffectiveAccessLoader,
  type ActorSession,
  type AuthorizedActor,
  type AuthorizeContext,
  type PermissionInput
} from "@wpmoo/rbac/runtime";
import { headers } from "next/headers";
import { createPlaygroundEnv } from "../config/env";
import { createPlaygroundAuth } from "./auth";
import { createPlaygroundQueryClient } from "./db";
import type { AdminPageAuthorizeContext } from "./phase2-access";

export type CreateAdminPageContextOptions = Readonly<{
  authSession?: (headers: Headers) => Promise<ActorSession | null>;
  client?: DbQueryClient;
  headers?: Headers;
  now?: Date;
}>;

async function readRequestHeaders(): Promise<Headers> {
  return new Headers(await headers());
}

export async function createAdminPageContext(
  options: CreateAdminPageContextOptions = {}
): Promise<AdminPageAuthorizeContext> {
  const env = createPlaygroundEnv(process.env);
  const requestHeaders = options.headers ?? await readRequestHeaders();
  const client = options.client ?? createPlaygroundQueryClient();
  const resolveSession = () =>
    options.authSession?.(requestHeaders) ??
    createPlaygroundAuth().getSession(requestHeaders);
  const context: AuthorizeContext = {
    getEffectiveAccessForRequest: createRequestEffectiveAccessLoader((userId) =>
      loadEffectiveAccess(client, userId)
    ),
    now: options.now,
    resolveSession
  };

  return {
    ...context,
    async authorize(
      permission: PermissionInput,
      authorizeContext: AuthorizeContext
    ): Promise<AuthorizedActor> {
      return authorize(permission, authorizeContext);
    },
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION
  };
}

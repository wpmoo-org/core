import type { ErrorCode } from "@wpmoo/errors";

export type PermissionInput = Readonly<{
  action: string;
  resource: string;
}>;

export type LifecycleStatus = "active" | "suspended" | "banned";

export type ActorSession = Readonly<{
  emailVerified?: boolean;
  sessionId: string;
  userId: string;
}>;

export type EffectiveAccess = Readonly<{
  lifecycle: Readonly<{
    expiresAt?: Date | null;
    status: LifecycleStatus;
  }>;
  permissions: ReadonlySet<string>;
  userId: string;
}>;

export type AuthorizedActor = Readonly<{
  emailVerified?: boolean;
  permissions: ReadonlySet<string>;
  sessionId: string;
  userId: string;
}>;

export type ResolveSession = () => Promise<ActorSession | null>;

export type LoadEffectiveAccess = (userId: string) => Promise<EffectiveAccess>;

export type AuthorizeContext = Readonly<{
  getEffectiveAccessForRequest: LoadEffectiveAccess;
  now?: Date;
  resolveSession: ResolveSession;
}>;

export type RequirePermissionInput = PermissionInput &
  Readonly<{
    access: EffectiveAccess;
  }>;

export class RbacError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.code = code;
    this.name = "RbacError";
  }
}

export async function authorize(
  input: PermissionInput,
  context: AuthorizeContext
): Promise<AuthorizedActor> {
  const session = await context.resolveSession();

  if (session === null) {
    throw new RbacError("auth.unauthorized");
  }

  const access = await context.getEffectiveAccessForRequest(session.userId);

  if (!isActiveLifecycle(access.lifecycle, context.now ?? new Date())) {
    throw new RbacError("auth.forbidden");
  }

  requirePermission({
    access,
    action: input.action,
    resource: input.resource
  });

  return {
    emailVerified: session.emailVerified,
    permissions: access.permissions,
    sessionId: session.sessionId,
    userId: session.userId
  };
}

export function requirePermission(input: RequirePermissionInput): void {
  if (!input.access.permissions.has(permissionId(input))) {
    throw new RbacError("auth.forbidden");
  }
}

export function permissionId(input: PermissionInput): string {
  return `${input.resource}:${input.action}`;
}

export function createRequestEffectiveAccessLoader(
  loadEffectiveAccess: LoadEffectiveAccess
): LoadEffectiveAccess {
  const cache = new Map<string, Promise<EffectiveAccess>>();

  return async (userId) => {
    const cached = cache.get(userId);

    if (cached !== undefined) {
      return cached;
    }

    const loading = loadEffectiveAccess(userId);

    cache.set(userId, loading);

    return loading;
  };
}

function isActiveLifecycle(
  lifecycle: EffectiveAccess["lifecycle"],
  now: Date
): boolean {
  if (lifecycle.status === "active") {
    return true;
  }

  if (lifecycle.expiresAt !== undefined && lifecycle.expiresAt !== null) {
    return lifecycle.expiresAt.getTime() <= now.getTime();
  }

  return false;
}

export { corePermissionCatalog } from "./catalog.js";
export type { PermissionCatalogEntry, PermissionRisk } from "./catalog.js";

import type { AuthorizedActor, AuthorizeContext, PermissionInput } from "@wpmoo/rbac";

export type RegistrationMode = "disabled" | "invite_only" | "public";

export type RegistrationAccessInput = Readonly<{
  isBootstrapException?: boolean;
  mode: RegistrationMode;
}>;

export type RegistrationAccess = Readonly<{
  allowed: boolean;
  reason: "invite_required" | "registration_disabled" | null;
}>;

export type AdminPageAuthorizeContext = AuthorizeContext &
  Readonly<{
    authorize: (
      permission: PermissionInput,
      context: AuthorizeContext
    ) => Promise<AuthorizedActor>;
    requireEmailVerification: boolean;
  }>;

export class AccessPolicyError extends Error {
  readonly code = "auth.forbidden" as const;

  constructor() {
    super("auth.forbidden");
    this.name = "AccessPolicyError";
  }
}

export function resolveRegistrationAccess(
  input: RegistrationAccessInput
): RegistrationAccess {
  if (input.mode === "disabled") {
    return {
      allowed: false,
      reason: "registration_disabled"
    };
  }

  if (input.mode === "invite_only" && input.isBootstrapException !== true) {
    return {
      allowed: false,
      reason: "invite_required"
    };
  }

  return {
    allowed: true,
    reason: null
  };
}

export function requireVerifiedEmailForPrivilegedAction(
  actor: AuthorizedActor,
  options: Readonly<{ requireEmailVerification: boolean }>
): void {
  if (options.requireEmailVerification && actor.emailVerified !== true) {
    throw new AccessPolicyError();
  }
}

export async function authorizeAdminPage(
  permission: PermissionInput,
  context: AdminPageAuthorizeContext
): Promise<AuthorizedActor> {
  const actor = await context.authorize(permission, context);

  requireVerifiedEmailForPrivilegedAction(actor, {
    requireEmailVerification: context.requireEmailVerification
  });

  return actor;
}

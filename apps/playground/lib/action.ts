import {
  GENERIC_ERROR_CODE,
  getErrorDefinition,
  toSafeErrorCode,
  type ErrorCode
} from "@wpmoo/errors";
import { z } from "zod";

export const actionRegistry = {
  "auth.login": {
    action: "login",
    audit: false,
    requireCsrf: false,
    resource: "auth",
    risk: "medium"
  },
  "auth.register": {
    action: "register",
    audit: false,
    requireCsrf: false,
    resource: "auth",
    risk: "medium"
  },
  "proof.noop": {
    action: "execute",
    audit: false,
    requireCsrf: false,
    resource: "proof",
    risk: "low"
  },
  "bootstrap.claim": {
    action: "claim",
    audit: true,
    requireCsrf: true,
    resource: "bootstrap",
    risk: "critical"
  },
  "admin.users.role.assign": {
    action: "update",
    audit: true,
    requireCsrf: true,
    resource: "admin.users",
    risk: "high"
  },
  "admin.users.role.revoke": {
    action: "update",
    audit: true,
    requireCsrf: true,
    resource: "admin.users",
    risk: "high"
  },
  "admin.users.role.bulk_assign": {
    action: "update",
    audit: true,
    requireCsrf: true,
    resource: "admin.users",
    risk: "high"
  },
  "admin.roles.permissions.save": {
    action: "update",
    audit: true,
    requireCsrf: true,
    resource: "admin.permissions",
    risk: "critical"
  },
  "admin.users.permissions.override": {
    action: "update",
    audit: true,
    requireCsrf: true,
    resource: "admin.permissions",
    risk: "critical"
  }
} as const;

export const SAFE_REDIRECT_PATHS = [
  "/",
  "/admin/users",
  "/dashboard",
  "/setup/admin"
] as const;

export type ActionId = keyof typeof actionRegistry;
export type ActionPolicy = (typeof actionRegistry)[ActionId];

export type ActionAuthorizeInput<Input> = Readonly<{
  action: string;
  input: Input;
  resource: string;
}>;

export type ActionContext<Input, Actor> = Readonly<{
  actor: Actor;
  input: Input;
  policy: ActionPolicy;
}>;

export type ActionOptions<Input extends object, Actor, Output> = Readonly<{
  authorize: (input: ActionAuthorizeInput<Input>) => Promise<Actor>;
  handler: (context: ActionContext<Input, Actor>) => Promise<Output>;
  schema: z.ZodType<Input>;
}>;

export type RouteActionContext<Input, Actor> = ActionContext<Input, Actor> &
  Readonly<{
    request: Request;
  }>;

export type RouteActionOptions<Input extends object, Actor> = Readonly<{
  authorize: (input: ActionAuthorizeInput<Input>) => Promise<Actor>;
  handler: (context: RouteActionContext<Input, Actor>) => Promise<Response>;
  parse: (request: Request) => Promise<unknown>;
  schema: z.ZodType<Input>;
}>;

export type ActionStateContext<State, Input, Actor> =
  ActionContext<Input, Actor> &
    Readonly<{
      formData: FormData;
      previousState: State;
    }>;

export type ActionStateOptions<State, Input extends object, Actor> = Readonly<{
  authorize: (input: ActionAuthorizeInput<Input>) => Promise<Actor>;
  handler: (context: ActionStateContext<State, Input, Actor>) => Promise<State>;
  onFailure: (previousState: State, code: ErrorCode) => Promise<State> | State;
  parse: (formData: FormData) => Promise<unknown> | unknown;
  schema: z.ZodType<Input>;
}>;

export type ActionFailure = Readonly<{
  error: {
    code: ErrorCode;
  };
  ok: false;
}>;

export type ActionSuccess<Output> = Readonly<{
  data: Output;
  ok: true;
}>;

export type ActionResult<Output> = ActionFailure | ActionSuccess<Output>;

type CsrfInput = Readonly<{
  csrfCookie?: string;
  csrfToken?: string;
}>;

export function action<Input extends object, Actor, Output>(
  actionId: ActionId,
  options: ActionOptions<Input, Actor, Output>
) {
  const policy = actionRegistry[actionId];

  return async function wrappedAction(rawInput: unknown): Promise<ActionResult<Output>> {
    const parsed = options.schema.safeParse(rawInput);

    if (!parsed.success) {
      return failure("validation.invalid_input");
    }

    try {
      assertCsrf(policy, parsed.data);

      const actor = await options.authorize({
        action: policy.action,
        input: parsed.data,
        resource: policy.resource
      });
      const data = await options.handler({
        actor,
        input: parsed.data,
        policy
      });

      return {
        data,
        ok: true
      };
    } catch (error) {
      return failure(getStableErrorCode(error));
    }
  };
}

export function actionState<State, Input extends object, Actor>(
  actionId: ActionId,
  options: ActionStateOptions<State, Input, Actor>
) {
  const policy = actionRegistry[actionId];

  return async function wrappedActionState(
    previousState: State,
    formData: FormData
  ): Promise<State> {
    let rawInput: unknown;

    try {
      rawInput = await options.parse(formData);
    } catch {
      return options.onFailure(previousState, "validation.invalid_input");
    }

    const parsed = options.schema.safeParse(rawInput);

    if (!parsed.success) {
      return options.onFailure(previousState, "validation.invalid_input");
    }

    try {
      assertCsrf(policy, parsed.data);

      const actor = await options.authorize({
        action: policy.action,
        input: parsed.data,
        resource: policy.resource
      });

      return await options.handler({
        actor,
        formData,
        input: parsed.data,
        policy,
        previousState
      });
    } catch (error) {
      return options.onFailure(previousState, getStableErrorCode(error));
    }
  };
}

export function routeAction<Input extends object, Actor>(
  actionId: ActionId,
  options: RouteActionOptions<Input, Actor>
) {
  const policy = actionRegistry[actionId];

  return async function wrappedRouteAction(request: Request): Promise<Response> {
    let rawInput: unknown;

    try {
      rawInput = await options.parse(request);
    } catch {
      return routeFailure("validation.invalid_input");
    }

    const parsed = options.schema.safeParse(rawInput);

    if (!parsed.success) {
      return routeFailure("validation.invalid_input");
    }

    try {
      assertCsrf(policy, parsed.data);

      const actor = await options.authorize({
        action: policy.action,
        input: parsed.data,
        resource: policy.resource
      });

      return await options.handler({
        actor,
        input: parsed.data,
        policy,
        request
      });
    } catch (error) {
      return routeFailure(getStableErrorCode(error));
    }
  };
}

export function safeRedirectTarget(
  rawTarget: string | null | undefined,
  allowedPaths: readonly string[] = SAFE_REDIRECT_PATHS
): string | null {
  if (rawTarget === undefined || rawTarget === null) {
    return null;
  }

  const trimmedTarget = rawTarget.trim();

  if (trimmedTarget.length === 0) {
    return null;
  }

  const decodedTarget = decodeRedirectTarget(trimmedTarget);

  if (
    !decodedTarget.startsWith("/") ||
    decodedTarget.startsWith("//") ||
    /^[a-z][a-z0-9+.-]*:/i.test(decodedTarget)
  ) {
    return null;
  }

  const pathname = new URL(decodedTarget, "https://wpmoo.local").pathname;
  const unlocalizedPath = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";

  return allowedPaths.includes(unlocalizedPath) ? pathname : null;
}

function assertCsrf(policy: ActionPolicy, input: object) {
  if (!policy.requireCsrf) {
    return;
  }

  const csrfInput = input as CsrfInput;

  if (
    csrfInput.csrfToken === undefined ||
    csrfInput.csrfCookie === undefined ||
    csrfInput.csrfToken !== csrfInput.csrfCookie
  ) {
    throw { code: "auth.forbidden" };
  }
}

function failure(code: ErrorCode): ActionFailure {
  return {
    error: {
      code
    },
    ok: false
  };
}

function routeFailure(code: ErrorCode): Response {
  return Response.json(
    {
      error: {
        code
      },
      ok: false
    },
    {
      status: getErrorDefinition(code).httpStatus
    }
  );
}

function getStableErrorCode(error: unknown): ErrorCode {
  if (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return toSafeErrorCode(error.code);
  }

  return GENERIC_ERROR_CODE;
}

function decodeRedirectTarget(target: string): string {
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

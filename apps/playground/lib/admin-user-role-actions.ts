import type { AuthorizedActor } from "@wpmoo/rbac";
import type { ErrorCode } from "@wpmoo/errors";
import { z } from "zod";

import {
  type ActionAuthorizeInput,
  type ActionResult,
  type ActionStateOptions
} from "./action";
import {
  mergeActionFeedbackState,
  type ActionFeedbackState,
  type AdminUserAction
} from "./action-feedback";
import {
  type BootstrapTransaction,
  createAssignRoleAction,
  createRevokeRoleAction
} from "./phase2-actions";

const roleMutationSchema = z.object({
  clientIp: z.string().min(1),
  csrfCookie: z.string().min(1).optional(),
  csrfToken: z.string().min(1).optional(),
  roleId: z.enum(["admin", "user"]),
  targetUserId: z.string().min(1)
});

const bulkRoleMutationSchema = z.object({
  clientIp: z.string().min(1),
  confirmed: z.literal("yes"),
  csrfCookie: z.string().min(1).optional(),
  csrfToken: z.string().min(1).optional(),
  targetUserIds: z.array(z.string().min(1)).min(1)
});

type RoleMutationInput = z.infer<typeof roleMutationSchema>;
type BulkRoleMutationInput = z.infer<typeof bulkRoleMutationSchema>;

type RoleMutationOutput =
  | {
      assigned?: boolean;
    }
  | {
      revoked?: boolean;
    };

export type AdminUserActionState = ActionFeedbackState;

export type CreateRoleActionStateOptions<Input extends object> = Readonly<{
  authorize: (input: ActionAuthorizeInput<Input>) => Promise<AuthorizedActor>;
  readCsrfCookie: () => string | undefined;
  transaction: BootstrapTransaction;
}>;

function toFeedbackState(
  action: Exclude<AdminUserAction, "admin.users.role.bulk_assign">,
  result: ActionResult<RoleMutationOutput>
): ActionFeedbackState {
  if (!result.ok) {
    return {
      status: "error",
      action,
      code: result.error.code
    };
  }

  const changed = action === "admin.users.role.assign"
    ? "assigned" in result.data && Boolean(result.data.assigned)
    : "revoked" in result.data && Boolean(result.data.revoked);

  return {
    status: "success",
    action,
    changed,
    code: null
  };
}

function parseRoleFormData(
  formData: FormData,
  csrfCookie: string | undefined
): RoleMutationInput {
  return {
    clientIp: "127.0.0.1",
    csrfCookie,
    csrfToken: optionalFormString(formData.get("csrfToken")),
    roleId:
      formData.get("roleId") === "admin"
        ? "admin"
        : "user",
    targetUserId: String(formData.get("targetUserId") ?? "")
  };
}

function parseBulkRoleFormData(
  formData: FormData,
  csrfCookie: string | undefined
) {
  return {
    clientIp: "127.0.0.1",
    confirmed: String(formData.get("confirmed") ?? ""),
    csrfCookie,
    csrfToken: optionalFormString(formData.get("csrfToken")),
    targetUserIds: formData
      .getAll("targetUserId")
      .map((value) => String(value))
      .filter((value) => value.length > 0)
  };
}

function optionalFormString(value: FormDataEntryValue | null): string | undefined {
  const text = value === null ? "" : String(value);

  return text.length === 0 ? undefined : text;
}

function failureState(action: AdminUserAction) {
  return (previousState: ActionFeedbackState, code: ErrorCode): ActionFeedbackState =>
    mergeActionFeedbackState(previousState, {
      status: "error",
      action,
      code
    });
}

export function createAssignAdminRoleStateOptions(
  options: CreateRoleActionStateOptions<RoleMutationInput>
): ActionStateOptions<ActionFeedbackState, RoleMutationInput, AuthorizedActor> {
  return {
    authorize: options.authorize,
    handler: async ({ actor, input, previousState }) => {
      const assignRole = createAssignRoleAction({
        authorize: async () => actor,
        transaction: options.transaction
      });
      const nextState = toFeedbackState(
        "admin.users.role.assign",
        await assignRole(input)
      );

      return mergeActionFeedbackState(previousState, nextState);
    },
    onFailure: failureState("admin.users.role.assign"),
    parse: (formData) => parseRoleFormData(formData, options.readCsrfCookie()),
    schema: roleMutationSchema
  };
}

export function createRevokeAdminRoleStateOptions(
  options: CreateRoleActionStateOptions<RoleMutationInput>
): ActionStateOptions<ActionFeedbackState, RoleMutationInput, AuthorizedActor> {
  return {
    authorize: options.authorize,
    handler: async ({ actor, input, previousState }) => {
      const revokeRole = createRevokeRoleAction({
        authorize: async () => actor,
        transaction: options.transaction
      });
      const nextState = toFeedbackState(
        "admin.users.role.revoke",
        await revokeRole(input)
      );

      return mergeActionFeedbackState(previousState, nextState);
    },
    onFailure: failureState("admin.users.role.revoke"),
    parse: (formData) => parseRoleFormData(formData, options.readCsrfCookie()),
    schema: roleMutationSchema
  };
}

export function createBulkAssignAdminRoleStateOptions(
  options: CreateRoleActionStateOptions<BulkRoleMutationInput>
): ActionStateOptions<ActionFeedbackState, BulkRoleMutationInput, AuthorizedActor> {
  return {
    authorize: options.authorize,
    handler: async ({ actor, input, previousState }) => {
      const assignRole = createAssignRoleAction({
        authorize: async () => actor,
        transaction: options.transaction
      });
      let changed = false;

      for (const targetUserId of Array.from(new Set(input.targetUserIds))) {
        const next = toFeedbackState(
          "admin.users.role.assign",
          await assignRole({
            clientIp: input.clientIp,
            csrfCookie: input.csrfCookie,
            csrfToken: input.csrfToken,
            roleId: "admin",
            targetUserId
          })
        );

        if (next.status === "error") {
          return mergeActionFeedbackState(previousState, {
            ...next,
            action: "admin.users.role.bulk_assign"
          });
        }

        changed = changed || next.changed === true;
      }

      return mergeActionFeedbackState(previousState, {
        status: "success",
        action: "admin.users.role.bulk_assign",
        changed,
        code: null
      });
    },
    onFailure: failureState("admin.users.role.bulk_assign"),
    parse: (formData) => parseBulkRoleFormData(formData, options.readCsrfCookie()),
    schema: bulkRoleMutationSchema
  };
}

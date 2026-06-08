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
  type AdminAction
} from "./action-feedback";
import {
  type BootstrapTransaction,
  createSaveRolePermissionsAction,
  createSetUserPermissionOverrideAction
} from "./phase2-actions";

const rolePermissionSaveSchema = z.object({
  clientIp: z.string().min(1),
  confirmed: z.literal("yes"),
  csrfCookie: z.string().min(1).optional(),
  csrfToken: z.string().min(1).optional(),
  permissionIds: z.array(z.string().min(1)),
  roleId: z.string().min(1)
});

const userPermissionOverrideSchema = z.object({
  clientIp: z.string().min(1),
  csrfCookie: z.string().min(1).optional(),
  csrfToken: z.string().min(1).optional(),
  override: z.enum(["clear", "deny", "grant"]),
  permissionId: z.string().min(1),
  targetUserId: z.string().min(1)
});

type RolePermissionSaveInput = z.infer<typeof rolePermissionSaveSchema>;
type UserPermissionOverrideInput = z.infer<typeof userPermissionOverrideSchema>;

type SaveOutput = Readonly<{
  saved?: boolean;
}>;

export type CreateAdminPermissionActionStateOptions<Input extends object> = Readonly<{
  authorize: (input: ActionAuthorizeInput<Input>) => Promise<AuthorizedActor>;
  readClientIp: () => Promise<string> | string;
  readCsrfCookie: () => Promise<string | undefined> | string | undefined;
  transaction: BootstrapTransaction;
}>;

function toFeedbackState(
  action: Extract<AdminAction, "admin.roles.permissions.save" | "admin.users.permissions.override">,
  result: ActionResult<SaveOutput>
): ActionFeedbackState {
  if (!result.ok) {
    return {
      status: "error",
      action,
      code: result.error.code
    };
  }

  return {
    status: "success",
    action,
    changed: Boolean(result.data.saved),
    code: null
  };
}

function failureState(action: AdminAction) {
  return (previousState: ActionFeedbackState, code: ErrorCode): ActionFeedbackState =>
    mergeActionFeedbackState(previousState, {
      status: "error",
      action,
      code
    });
}

function optionalFormString(value: FormDataEntryValue | null): string | undefined {
  const text = value === null ? "" : String(value);

  return text.length === 0 ? undefined : text;
}

function parseRolePermissionFormData(
  formData: FormData,
  csrfCookie: string | undefined,
  clientIp: string
): RolePermissionSaveInput {
  return {
    clientIp,
    confirmed: String(formData.get("confirmed") ?? ""),
    csrfCookie,
    csrfToken: optionalFormString(formData.get("csrfToken")),
    permissionIds: formData
      .getAll("permissionId")
      .map((value) => String(value))
      .filter((value) => value.length > 0),
    roleId: String(formData.get("roleId") ?? "")
  };
}

function parseUserPermissionOverrideFormData(
  formData: FormData,
  csrfCookie: string | undefined,
  clientIp: string
): UserPermissionOverrideInput {
  const override = String(formData.get("override") ?? "clear");

  return {
    clientIp,
    csrfCookie,
    csrfToken: optionalFormString(formData.get("csrfToken")),
    override:
      override === "grant" || override === "deny"
        ? override
        : "clear",
    permissionId: String(formData.get("permissionId") ?? ""),
    targetUserId: String(formData.get("targetUserId") ?? "")
  };
}

export function createSaveRolePermissionsStateOptions(
  options: CreateAdminPermissionActionStateOptions<RolePermissionSaveInput>
): ActionStateOptions<ActionFeedbackState, RolePermissionSaveInput, AuthorizedActor> {
  return {
    authorize: options.authorize,
    handler: async ({ actor, input, previousState }) => {
      const savePermissions = createSaveRolePermissionsAction({
        authorize: async () => actor,
        transaction: options.transaction
      });
      const nextState = toFeedbackState(
        "admin.roles.permissions.save",
        await savePermissions(input)
      );

      return mergeActionFeedbackState(previousState, nextState);
    },
    onFailure: failureState("admin.roles.permissions.save"),
    parse: async (formData) =>
      parseRolePermissionFormData(
        formData,
        await options.readCsrfCookie(),
        await options.readClientIp()
      ),
    schema: rolePermissionSaveSchema
  };
}

export function createUserPermissionOverrideStateOptions(
  options: CreateAdminPermissionActionStateOptions<UserPermissionOverrideInput>
): ActionStateOptions<ActionFeedbackState, UserPermissionOverrideInput, AuthorizedActor> {
  return {
    authorize: options.authorize,
    handler: async ({ actor, input, previousState }) => {
      const setOverride = createSetUserPermissionOverrideAction({
        authorize: async () => actor,
        transaction: options.transaction
      });
      const nextState = toFeedbackState(
        "admin.users.permissions.override",
        await setOverride(input)
      );

      return mergeActionFeedbackState(previousState, nextState);
    },
    onFailure: failureState("admin.users.permissions.override"),
    parse: async (formData) =>
      parseUserPermissionOverrideFormData(
        formData,
        await options.readCsrfCookie(),
        await options.readClientIp()
      ),
    schema: userPermissionOverrideSchema
  };
}

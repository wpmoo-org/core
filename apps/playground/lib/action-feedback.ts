import { getErrorDefinition } from "@wpmoo/errors";

export type Locale = "de" | "en";

export type AdminAction =
  | "admin.roles.permissions.save"
  | "admin.users.permissions.override"
  | "admin.users.role.assign"
  | "admin.users.role.bulk_assign"
  | "admin.users.role.revoke";

export type AdminUserAction = AdminAction;

export type ActionFeedbackStatus = "idle" | "error" | "success";

export type ActionFeedbackState = Readonly<{
  status: ActionFeedbackStatus;
  action: AdminAction | null;
  changed?: boolean;
  code: string | null;
}>;

export type SearchParamsLike = Readonly<{
  action?: string | string[];
  code?: string | string[];
  result?: string | string[];
}>;

const DEFAULT_LOCALE = "en" as const;
const SEARCH_ACTION_ASSIGN: AdminAction = "admin.users.role.assign";
const SEARCH_ACTION_BULK_ASSIGN: AdminAction = "admin.users.role.bulk_assign";
const SEARCH_ACTION_REVOKE: AdminAction = "admin.users.role.revoke";
const SEARCH_ACTION_ROLE_PERMISSIONS_SAVE: AdminAction = "admin.roles.permissions.save";
const SEARCH_ACTION_USER_PERMISSION_OVERRIDE: AdminAction = "admin.users.permissions.override";
const DEFAULT_STATE: ActionFeedbackState = {
  status: "idle",
  action: null,
  code: null
};

const localeMessages = {
  de: {
    "Actions.AdminRoles.PermissionsSave": "Rollenberechtigungen gespeichert.",
    "Actions.AdminUsers.Assign": "Administratorrolle zugewiesen.",
    "Actions.AdminUsers.BulkAssign": "Administratorrollen zugewiesen.",
    "Actions.AdminUsers.Noop": "Es waren keine Änderungen erforderlich.",
    "Actions.AdminUsers.Override": "Berechtigungsüberschreibung gespeichert.",
    "Actions.AdminUsers.Revoke": "Administratorrolle entfernt.",
    "Errors.Auth.Forbidden": "Zugriff verweigert.",
    "Errors.Auth.InvalidCredentials": "Die Anmeldedaten sind ungültig.",
    "Errors.Auth.RateLimited": "Zu viele Anfragen. Bitte später erneut versuchen.",
    "Errors.Auth.Unauthorized": "Anmeldung erforderlich.",
    "Errors.Bootstrap.InvalidOrUsed": "Der Token ist ungültig oder bereits verwendet worden.",
    "Errors.System.Unexpected": "Ein unerwarteter Fehler ist aufgetreten.",
    "Errors.Validation.InvalidInput": "Die übergebenen Daten sind ungültig."
  },
  en: {
    "Actions.AdminRoles.PermissionsSave": "Role permissions saved.",
    "Actions.AdminUsers.Assign": "Admin role assigned.",
    "Actions.AdminUsers.BulkAssign": "Admin roles assigned.",
    "Actions.AdminUsers.Noop": "No changes were needed.",
    "Actions.AdminUsers.Override": "Permission override saved.",
    "Actions.AdminUsers.Revoke": "Admin role revoked.",
    "Errors.Auth.Forbidden": "Access is forbidden.",
    "Errors.Auth.InvalidCredentials": "Invalid login credentials.",
    "Errors.Auth.RateLimited": "Too many attempts. Please try again later.",
    "Errors.Auth.Unauthorized": "Authentication is required.",
    "Errors.Bootstrap.InvalidOrUsed": "The bootstrap token is invalid or has already been used.",
    "Errors.System.Unexpected": "An unexpected error occurred.",
    "Errors.Validation.InvalidInput": "Invalid input was provided."
  }
} as const;

const DEFAULT_SUCCESS_BY_ACTION: Record<AdminAction, string> = {
  [SEARCH_ACTION_ASSIGN]: "Actions.AdminUsers.Assign",
  [SEARCH_ACTION_BULK_ASSIGN]: "Actions.AdminUsers.BulkAssign",
  [SEARCH_ACTION_REVOKE]: "Actions.AdminUsers.Revoke",
  [SEARCH_ACTION_ROLE_PERMISSIONS_SAVE]: "Actions.AdminRoles.PermissionsSave",
  [SEARCH_ACTION_USER_PERMISSION_OVERRIDE]: "Actions.AdminUsers.Override"
};

function isAdminAction(value: string): value is AdminAction {
  return (
    value === SEARCH_ACTION_ASSIGN ||
    value === SEARCH_ACTION_BULK_ASSIGN ||
    value === SEARCH_ACTION_REVOKE ||
    value === SEARCH_ACTION_ROLE_PERMISSIONS_SAVE ||
    value === SEARCH_ACTION_USER_PERMISSION_OVERRIDE
  );
}

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function createIdleActionFeedbackState(): ActionFeedbackState {
  return DEFAULT_STATE;
}

export function parseLocale(value: string | undefined): Locale {
  return value === "de" ? "de" : DEFAULT_LOCALE;
}

export function parseActionFeedbackFromSearchParams(
  params: SearchParamsLike | undefined
): ActionFeedbackState {
  if (params === undefined) {
    return DEFAULT_STATE;
  }

  const action = firstValue(params.action);
  const result = firstValue(params.result);
  const code = firstValue(params.code);

  if (action === undefined || !isAdminAction(action)) {
    return DEFAULT_STATE;
  }

  if (result === "success") {
    return {
      action,
      code: null,
      status: "success"
    };
  }

  if (result === "error") {
    return {
      action,
      code: getErrorDefinition(code ?? "system.unexpected").code,
      status: "error"
    };
  }

  return DEFAULT_STATE;
}

export function mergeActionFeedbackState(
  current: ActionFeedbackState,
  next: ActionFeedbackState
): ActionFeedbackState {
  if (next.status === "idle") {
    return current;
  }

  return next;
}

export function resolveActionFeedbackMessage(
  state: ActionFeedbackState,
  locale: Locale
): string | null {
  if (state.status === "idle") {
    return null;
  }

  const messages = localeMessages[locale] ?? localeMessages[DEFAULT_LOCALE];
  const fallbackMessages = localeMessages[DEFAULT_LOCALE];

  const localMessage = (key: string): string =>
    (messages[key as keyof typeof messages] ??
      fallbackMessages[key as keyof typeof fallbackMessages] ??
      key);

  if (state.status === "success" && state.action !== null) {
    if (state.changed === false) {
      return localMessage("Actions.AdminUsers.Noop");
    }

    return localMessage(DEFAULT_SUCCESS_BY_ACTION[state.action]);
  }

  const errorCode = getErrorDefinition(state.code ?? "system.unexpected").translationKey;

  return localMessage(errorCode);
}

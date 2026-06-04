export type ErrorLogLevel = "info" | "warn" | "error";

export type ErrorDefinition<Code extends string = string> = Readonly<{
  code: Code;
  httpStatus: number;
  logLevel: ErrorLogLevel;
  translationKey: string;
}>;

export const ERROR_REGISTRY = {
  "auth.unauthorized": {
    code: "auth.unauthorized",
    httpStatus: 401,
    logLevel: "warn",
    translationKey: "Errors.Auth.Unauthorized"
  },
  "auth.forbidden": {
    code: "auth.forbidden",
    httpStatus: 403,
    logLevel: "warn",
    translationKey: "Errors.Auth.Forbidden"
  },
  "auth.invalid_credentials": {
    code: "auth.invalid_credentials",
    httpStatus: 401,
    logLevel: "warn",
    translationKey: "Errors.Auth.InvalidCredentials"
  },
  "bootstrap.invalid_or_used": {
    code: "bootstrap.invalid_or_used",
    httpStatus: 409,
    logLevel: "warn",
    translationKey: "Errors.Bootstrap.InvalidOrUsed"
  },
  "validation.invalid_input": {
    code: "validation.invalid_input",
    httpStatus: 400,
    logLevel: "warn",
    translationKey: "Errors.Validation.InvalidInput"
  },
  "system.unexpected": {
    code: "system.unexpected",
    httpStatus: 500,
    logLevel: "error",
    translationKey: "Errors.System.Unexpected"
  }
} as const satisfies Record<string, ErrorDefinition>;

export type ErrorCode = keyof typeof ERROR_REGISTRY;

export const GENERIC_ERROR_CODE = "system.unexpected" satisfies ErrorCode;

export function isKnownErrorCode(code: string): code is ErrorCode {
  return Object.prototype.hasOwnProperty.call(ERROR_REGISTRY, code);
}

export function toSafeErrorCode(code: string | null | undefined): ErrorCode {
  if (typeof code === "string" && isKnownErrorCode(code)) {
    return code;
  }

  return GENERIC_ERROR_CODE;
}

export function getErrorDefinition(
  code: string | null | undefined
): ErrorDefinition<ErrorCode> {
  return ERROR_REGISTRY[toSafeErrorCode(code)];
}

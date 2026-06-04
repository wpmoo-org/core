import { describe, expect, it } from "vitest";
import {
  ERROR_REGISTRY,
  GENERIC_ERROR_CODE,
  getErrorDefinition,
  isKnownErrorCode,
  toSafeErrorCode
} from "../src/index.js";

describe("@wpmoo/errors", () => {
  it("exposes the Phase 1 stable error code registry", () => {
    expect(Object.keys(ERROR_REGISTRY).sort()).toEqual([
      "auth.forbidden",
      "auth.invalid_credentials",
      "auth.unauthorized",
      "bootstrap.invalid_or_used",
      "system.unexpected",
      "validation.invalid_input"
    ]);
  });

  it("maps known codes to stable status, translation, and log metadata", () => {
    expect(getErrorDefinition("auth.unauthorized")).toMatchObject({
      code: "auth.unauthorized",
      httpStatus: 401,
      logLevel: "warn",
      translationKey: "Errors.Auth.Unauthorized"
    });
    expect(getErrorDefinition("validation.invalid_input")).toMatchObject({
      code: "validation.invalid_input",
      httpStatus: 400,
      logLevel: "warn",
      translationKey: "Errors.Validation.InvalidInput"
    });
    expect(getErrorDefinition("system.unexpected")).toMatchObject({
      code: "system.unexpected",
      httpStatus: 500,
      logLevel: "error",
      translationKey: "Errors.System.Unexpected"
    });
  });

  it("maps unknown codes to the safe generic system error", () => {
    expect(GENERIC_ERROR_CODE).toBe("system.unexpected");
    expect(isKnownErrorCode("auth.forbidden")).toBe(true);
    expect(isKnownErrorCode("db.unique_violation")).toBe(false);
    expect(toSafeErrorCode("db.unique_violation")).toBe("system.unexpected");
    expect(getErrorDefinition("db.unique_violation")).toEqual(
      ERROR_REGISTRY["system.unexpected"]
    );
  });
});

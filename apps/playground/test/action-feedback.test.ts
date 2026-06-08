import { describe, expect, it } from "vitest";
import {
  createIdleActionFeedbackState,
  parseActionFeedbackFromSearchParams,
  parseLocale,
  resolveActionFeedbackMessage
} from "../lib/action-feedback.js";

describe("playground action feedback", () => {
  it("defaults unknown locales to English", () => {
    expect(parseLocale("de")).toBe("de");
    expect(parseLocale("fr")).toBe("en");
    expect(parseLocale(undefined)).toBe("en");
  });

  it("creates the shared idle action feedback state", () => {
    expect(createIdleActionFeedbackState()).toEqual({
      action: null,
      code: null,
      status: "idle"
    });
  });

  it("parses action feedback success from search params", () => {
    expect(
      parseActionFeedbackFromSearchParams({
        action: "admin.users.role.assign",
        result: "success"
      })
    ).toMatchObject({
      status: "success",
      action: "admin.users.role.assign",
      code: null
    });
  });

  it("parses stable error codes from search params and maps unknown values safely", () => {
    expect(
      parseActionFeedbackFromSearchParams({
        action: "admin.users.role.revoke",
        result: "error",
        code: "auth.forbidden"
      })
    ).toMatchObject({
      status: "error",
      action: "admin.users.role.revoke",
      code: "auth.forbidden"
    });

    expect(
      parseActionFeedbackFromSearchParams({
        action: "admin.users.role.assign",
        result: "error",
        code: "does.not.exist"
      })
    ).toMatchObject({
      status: "error",
      action: "admin.users.role.assign",
      code: "system.unexpected"
    });
  });

  it("resolves localized action feedback messages for success and error states", () => {
    expect(
      resolveActionFeedbackMessage(
        {
          action: "admin.users.role.assign",
          changed: true,
          code: null,
          status: "success"
        },
        "en"
      )
    ).toBe("Admin role assigned.");

    expect(
      resolveActionFeedbackMessage(
        {
          action: "admin.roles.permissions.save",
          changed: true,
          code: null,
          status: "success"
        },
        "en"
      )
    ).toBe("Role permissions saved.");

    expect(
      resolveActionFeedbackMessage(
        {
          action: "admin.users.permissions.override",
          changed: false,
          code: null,
          status: "success"
        },
        "de"
      )
    ).toBe("Es waren keine Änderungen erforderlich.");

    expect(
      resolveActionFeedbackMessage(
        {
          action: "admin.users.role.revoke",
          code: "auth.forbidden",
          status: "error"
        },
        "de"
      )
    ).toBe("Zugriff verweigert.");
  });
});

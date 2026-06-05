import { describe, expect, it } from "vitest";
import {
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
          action: "admin.users.role.bulk_assign",
          changed: true,
          code: null,
          status: "success"
        },
        "en"
      )
    ).toBe("Admin roles assigned.");

    expect(
      resolveActionFeedbackMessage(
        {
          action: "admin.users.role.revoke",
          changed: false,
          code: null,
          status: "success"
        },
        "de"
      )
    ).toBe("Die Rolle war bereits in diesem Zustand.");

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

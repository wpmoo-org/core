import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, REDACTED_VALUE, redactSensitiveData } from "../src/index.js";

describe("redactSensitiveData", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redacts required secret and token key shapes", () => {
    const sensitiveKeys = [
      "password",
      "token",
      "secret",
      "authorization",
      "cookie",
      "access_token",
      "refresh_token",
      "id_token"
    ];
    const metadata = Object.fromEntries(
      sensitiveKeys.map((key) => [key, `raw-${key}`])
    );

    expect(redactSensitiveData(metadata)).toEqual(
      Object.fromEntries(sensitiveKeys.map((key) => [key, REDACTED_VALUE]))
    );
  });

  it("redacts sensitive substrings recursively without changing safe values", () => {
    const metadata = {
      requestId: "req_123",
      nested: {
        bearerAuthorizationHeader: "Bearer raw",
        userEmail: "user@example.com"
      },
      attempts: [{ refreshTokenValue: "refresh" }, { status: "blocked" }]
    };

    expect(redactSensitiveData(metadata)).toEqual({
      requestId: "req_123",
      nested: {
        bearerAuthorizationHeader: REDACTED_VALUE,
        userEmail: REDACTED_VALUE
      },
      attempts: [{ refreshTokenValue: REDACTED_VALUE }, { status: "blocked" }]
    });
  });

  it("does not mutate the original metadata object", () => {
    const metadata = {
      password: "raw-password",
      nested: { token: "raw-token" }
    };

    redactSensitiveData(metadata);

    expect(metadata).toEqual({
      password: "raw-password",
      nested: { token: "raw-token" }
    });
  });
});

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes info, warn, and error logs with redacted metadata", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    logger.info("boot", { password: "raw-password", safe: "visible" });
    logger.warn("auth", { authorization: "Bearer raw" });
    logger.error("oauth", { access_token: "raw-access-token" });

    expect(info).toHaveBeenCalledWith("boot", {
      password: REDACTED_VALUE,
      safe: "visible"
    });
    expect(warn).toHaveBeenCalledWith("auth", {
      authorization: REDACTED_VALUE
    });
    expect(error).toHaveBeenCalledWith("oauth", {
      access_token: REDACTED_VALUE
    });
  });
});

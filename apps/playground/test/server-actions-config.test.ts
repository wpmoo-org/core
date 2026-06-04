import { describe, expect, it } from "vitest";
import { getServerActionAllowedOrigins } from "../config/server-actions.js";

describe("getServerActionAllowedOrigins", () => {
  it("uses the public app URL host as the same-site server action origin", () => {
    expect(
      getServerActionAllowedOrigins({
        NEXT_PUBLIC_APP_URL: "https://app.example.com/dashboard"
      })
    ).toEqual(["app.example.com"]);
  });

  it("normalizes configured URLs, hosts, wildcard domains, and duplicates", () => {
    expect(
      getServerActionAllowedOrigins({
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
        SERVER_ACTION_ALLOWED_ORIGINS:
          "https://proxy.example.com, app.example.com, *.proxy.example.com"
      })
    ).toEqual([
      "app.example.com",
      "proxy.example.com",
      "*.proxy.example.com"
    ]);
  });

  it("ignores blank and malformed configured origins", () => {
    expect(
      getServerActionAllowedOrigins({
        SERVER_ACTION_ALLOWED_ORIGINS: " , https://, localhost:3000"
      })
    ).toEqual(["localhost:3000"]);
  });
});

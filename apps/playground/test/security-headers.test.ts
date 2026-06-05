import { describe, expect, it } from "vitest";
import { createNextConfig } from "../next.config.js";

async function configuredHeaderMap() {
  const headers = await createNextConfig({
    NEXT_PUBLIC_APP_URL: "https://app.example.com",
    NODE_ENV: "production"
  }).headers?.();
  const globalHeaders = headers?.find((entry) => entry.source === "/(.*)");

  return new Map(
    globalHeaders?.headers.map((header) => [header.key, header.value]) ?? []
  );
}

describe("security headers", () => {
  it("attaches baseline response security headers through Next config", async () => {
    const headers = await configuredHeaderMap();

    expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(headers.get("Permissions-Policy")).toContain("camera=()");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
  });

  it("keeps production nonce CSP out of the static baseline path", async () => {
    const headers = await configuredHeaderMap();

    expect(headers.get("Content-Security-Policy")).toContain("script-src 'self'");
    expect(headers.get("Content-Security-Policy")).not.toContain("'nonce-");
  });
});

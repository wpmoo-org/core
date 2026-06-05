import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Better Auth app route", () => {
  it("exports Better Auth GET and POST handlers without hand-rolled auth logic", () => {
    const routeSource = readFileSync(
      resolve(import.meta.dirname, "../app/api/auth/[...all]/route.ts"),
      "utf8"
    );

    expect(routeSource).toContain("await import");
    expect(routeSource).toContain("auth.handler(request)");
    expect(routeSource).toContain("export const GET");
    expect(routeSource).toContain("export const POST");
    expect(routeSource).not.toContain("betterAuth(");
    expect(routeSource).not.toContain("new Response");
    expect(routeSource).not.toContain("Response.json");
  });

  it("composes auth from the app-level database helper and validated env", () => {
    const authSource = readFileSync(
      resolve(import.meta.dirname, "../lib/auth.ts"),
      "utf8"
    );

    expect(authSource).toContain("createAuth");
    expect(authSource).toContain("createPlaygroundEnv(process.env)");
    expect(authSource).toContain("createPlaygroundDatabase()");
    expect(authSource).toContain("useSecureCookies: env.NODE_ENV === \"production\"");
  });
});

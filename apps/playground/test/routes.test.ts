import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appDir = resolve(import.meta.dirname, "../app");
const phaseRoutes = [
  "login/page.tsx",
  "register/page.tsx",
  "dashboard/page.tsx",
  "setup/admin/page.tsx",
  "admin/users/page.tsx",
  "admin/users/[userId]/access/page.tsx",
  "admin/audit/page.tsx",
  "admin/roles/page.tsx",
  "admin/roles/[roleId]/page.tsx"
];

describe("app routes", () => {
  it("defines the secure slice routes and localized re-exports", () => {
    for (const route of phaseRoutes) {
      expect(existsSync(resolve(appDir, route))).toBe(true);
      expect(existsSync(resolve(appDir, "[locale]", route))).toBe(true);
      const localizedContent = readFileSync(resolve(appDir, "[locale]", route), "utf8");

      expect(localizedContent).toContain("export { default }");
      expect(localizedContent).toContain("export *");
    }
  });

  it("marks protected and auth-adjacent routes as dynamic", () => {
    for (const route of phaseRoutes) {
      expect(readFileSync(resolve(appDir, route), "utf8")).toContain(
        'export const dynamic = "force-dynamic"'
      );
    }
  });
});

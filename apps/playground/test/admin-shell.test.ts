import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const adminDir = resolve(import.meta.dirname, "../app/admin");
const localeAdminDir = resolve(import.meta.dirname, "../app/[locale]/admin");
const componentDir = resolve(import.meta.dirname, "../components/admin");

describe("admin shell", () => {
  it("wraps the app router with the nuqs adapter for URL-backed table state", () => {
    const rootLayout = readFileSync(
      resolve(import.meta.dirname, "../app/layout.tsx"),
      "utf8"
    );

    expect(rootLayout).toContain('from "nuqs/adapters/next/app"');
    expect(rootLayout).toContain("<NuqsAdapter>{children}</NuqsAdapter>");
  });

  it("adds shared layouts for default and localized admin namespaces", () => {
    const adminLayout = readFileSync(resolve(adminDir, "layout.tsx"), "utf8");
    const localeAdminLayout = readFileSync(
      resolve(localeAdminDir, "layout.tsx"),
      "utf8"
    );

    expect(adminLayout).toContain("AdminShellLayout");
    expect(adminLayout).toContain('headers()).get("x-wpmoo-locale")');
    expect(localeAdminLayout).toBe(
      'export { default } from "../../admin/layout";\nexport * from "../../admin/layout";\n'
    );
  });

  it("keeps admin route auth loaders and switches admin pages to shell content wrappers", () => {
    const usersPage = readFileSync(resolve(adminDir, "users/page.tsx"), "utf8");
    const auditPage = readFileSync(resolve(adminDir, "audit/page.tsx"), "utf8");

    expect(usersPage).toContain("createAdminPageContext");
    expect(usersPage).toContain("createPlaygroundQueryClient");
    expect(usersPage).toContain("admin-panel");
    expect(usersPage).toContain("AdminUserRoles");
    expect(usersPage).not.toContain('className="shell"');

    expect(auditPage).toContain("createAdminPageContext");
    expect(auditPage).toContain("createPlaygroundQueryClient");
    expect(auditPage).toContain("admin-panel");
    expect(auditPage).not.toContain('className="shell"');
  });

  it("implements responsive admin shell controls and binary theme toggle in client shell", () => {
    const shellClient = readFileSync(
      resolve(componentDir, "admin-shell-client.tsx"),
      "utf8"
    );

    expect(shellClient).toContain('aria-controls="admin-sidebar"');
    expect(shellClient).toContain('aria-expanded={isSidebarOpen}');
    expect(shellClient).toContain("className={`admin-sidebar${isSidebarOpen ? \" is-open\" : \"\"}`}");
    expect(shellClient).toContain('admin-theme-toggle');
    expect(shellClient).toContain("isThemeReady");
    expect(shellClient).toContain("aria-pressed={isDarkMode}");
    expect(shellClient).toContain("{isDarkMode ? \"Light\" : \"Dark\"}");
  });
});

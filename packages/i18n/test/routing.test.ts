import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLocalizedPath,
  createI18nRoutingConfig,
  generateLocalizedReexports,
  parseLocaleList,
  resolveI18nMiddleware
} from "../src/index.js";

describe("@wpmoo/i18n routing", () => {
  it("parses comma-separated locale env values with stable defaults", () => {
    expect(parseLocaleList(" en, de, en ,, tr ")).toEqual(["en", "de", "tr"]);
    expect(parseLocaleList(undefined)).toEqual(["en"]);
  });

  it("creates an as-needed route config that keeps the default locale routable", () => {
    expect(
      createI18nRoutingConfig({
        NEXT_PUBLIC_DEFAULT_LOCALE: "en",
        NEXT_PUBLIC_LOCALES: "de,tr"
      })
    ).toEqual({
      defaultLocale: "en",
      localePrefix: "as-needed",
      locales: ["en", "de", "tr"]
    });
  });

  it("builds default-locale paths without a prefix and non-default paths with one", () => {
    const routing = createI18nRoutingConfig({
      NEXT_PUBLIC_DEFAULT_LOCALE: "en",
      NEXT_PUBLIC_LOCALES: "en,de"
    });

    expect(buildLocalizedPath("/settings/profile", "en", routing)).toBe(
      "/settings/profile"
    );
    expect(buildLocalizedPath("settings/profile", "de", routing)).toBe(
      "/de/settings/profile"
    );
  });

  it("resolves locale middleware decisions without importing Next.js", () => {
    const routing = createI18nRoutingConfig({
      NEXT_PUBLIC_DEFAULT_LOCALE: "en",
      NEXT_PUBLIC_LOCALES: "en,de"
    });

    expect(resolveI18nMiddleware("/admin/users", routing)).toEqual({
      locale: "en",
      localized: false,
      pathname: "/admin/users"
    });
    expect(resolveI18nMiddleware("/de/admin/users", routing)).toEqual({
      locale: "de",
      localized: true,
      pathname: "/de/admin/users"
    });
  });
});

describe("generateLocalizedReexports", () => {
  it("creates localized app route re-exports and skips existing locale routes", async () => {
    const root = mkdtempSync(join(tmpdir(), "wpmoo-i18n-"));
    const appDir = join(root, "app");

    try {
      await mkdir(join(appDir, "settings"), { recursive: true });
      await mkdir(join(appDir, "[locale]", "already-localized"), {
        recursive: true
      });
      writeFileSync(join(appDir, "page.tsx"), "export default function Home() {}");
      writeFileSync(
        join(appDir, "settings", "page.tsx"),
        "export default function Settings() {}"
      );
      writeFileSync(
        join(appDir, "[locale]", "already-localized", "page.tsx"),
        "export default function Localized() {}"
      );

      const changes = await generateLocalizedReexports({ appDir });

      expect(changes.map((change) => change.relativeTarget).sort()).toEqual([
        "[locale]/page.tsx",
        "[locale]/settings/page.tsx"
      ]);
      expect(readFileSync(join(appDir, "[locale]", "page.tsx"), "utf8")).toBe(
        'export { default } from "../page";\nexport * from "../page";\n'
      );
      expect(
        readFileSync(join(appDir, "[locale]", "settings", "page.tsx"), "utf8")
      ).toBe(
        'export { default } from "../../settings/page";\nexport * from "../../settings/page";\n'
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

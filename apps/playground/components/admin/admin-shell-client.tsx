"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useMemo, useState } from "react";

const themeStorageKey = "playground:theme";

type AdminShellClientProps = Readonly<{
  children: ReactNode;
  localePrefix: string;
}>;

type AdminNavItem = {
  href: string;
  label: string;
  slug: "audit" | "roles" | "users";
};

const adminNav: readonly AdminNavItem[] = [
  { href: "/admin/users", label: "Users", slug: "users" },
  { href: "/admin/roles", label: "Roles", slug: "roles" },
  { href: "/admin/audit", label: "Audit", slug: "audit" }
];

export function AdminShellClient({
  children,
  localePrefix
}: AdminShellClientProps) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isThemeReady, setIsThemeReady] = useState(false);

  const activeSlug = useMemo(() => {
    if (!pathname) {
      return "users";
    }

    if (pathname.includes("/admin/users")) {
      return "users";
    }

    if (pathname.includes("/admin/roles")) {
      return "roles";
    }

    if (pathname.includes("/admin/audit")) {
      return "audit";
    }

    return "users";
  }, [pathname]);

  useEffect(() => {
    const persistedTheme = window.localStorage.getItem(themeStorageKey);
    const isStoredThemeDark = persistedTheme === "dark";
    const prefersDarkMode =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;

    const nextIsDarkMode = isStoredThemeDark || (!persistedTheme && prefersDarkMode);

    document.documentElement.setAttribute(
      "data-theme",
      nextIsDarkMode ? "dark" : "light"
    );
    setIsDarkMode(nextIsDarkMode);
    setIsThemeReady(true);
  }, []);

  useEffect(() => {
    if (!isThemeReady) {
      return;
    }

    const nextTheme = isDarkMode ? "dark" : "light";

    document.documentElement.setAttribute("data-theme", nextTheme);
    window.localStorage.setItem(themeStorageKey, nextTheme);
  }, [isDarkMode, isThemeReady]);

  const toggleTheme = () => {
    setIsDarkMode((previous) => !previous);
  };

  const navPrefix = localePrefix === "/" ? "" : localePrefix;

  return (
    <div className="admin-shell">
      <button
        className="admin-sidebar-hamburger"
        onClick={() => {
          setIsSidebarOpen((open) => !open);
        }}
        aria-expanded={isSidebarOpen}
        aria-controls="admin-sidebar"
        type="button"
      >
        Menu
      </button>

      <aside
        id="admin-sidebar"
        className={`admin-sidebar${isSidebarOpen ? " is-open" : ""}`}
      >
        <nav aria-label="Admin">
          <p className="admin-sidebar-title">Admin</p>
          <ul>
            {adminNav.map((item) => {
              const href = `${navPrefix}${item.href}`;

              return (
                <li key={item.slug}>
                  <Link
                    className={activeSlug === item.slug ? "is-active" : undefined}
                    href={href}
                    onClick={() => {
                      setIsSidebarOpen(false);
                    }}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <main className="admin-canvas">
        <header className="admin-topbar">
          <span>Administration</span>
          <button
            type="button"
            onClick={toggleTheme}
            aria-pressed={isDarkMode}
            className="admin-theme-toggle"
          >
            {isDarkMode ? "Light" : "Dark"}
          </button>
        </header>

        <section className="admin-content">{children}</section>
      </main>
    </div>
  );
}

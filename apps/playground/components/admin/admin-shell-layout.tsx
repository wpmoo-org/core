import type { ReactNode } from "react";

import { AdminShellClient } from "./admin-shell-client";

type AdminShellLayoutProps = Readonly<{
  children: ReactNode;
  locale?: string;
}>;

export function AdminShellLayout({ children, locale }: AdminShellLayoutProps) {
  const localePrefix = locale ? `/${locale}` : "";

  return <AdminShellClient localePrefix={localePrefix}>{children}</AdminShellClient>;
}

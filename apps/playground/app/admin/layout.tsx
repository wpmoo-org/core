import { headers } from "next/headers";
import { AdminShellLayout } from "../../components/admin/admin-shell-layout";
import type { ReactNode } from "react";

export default async function AdminLayout({
  children
}: Readonly<{ children: ReactNode }>) {
  const locale = (await headers()).get("x-wpmoo-locale") === "de" ? "de" : undefined;

  return <AdminShellLayout locale={locale}>{children}</AdminShellLayout>;
}

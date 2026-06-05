"use client";

import { useMemo } from "react";
import {
  DataTable,
  DataTableActionBar,
  DataTableFacetedFilter,
  DataTablePagination,
  DataTableToolbar,
  useDataTable,
  type DataTableColumnDef
} from "@wpmoo/ui/data-table";

import {
  type ActionFeedbackState,
  type Locale
} from "../../lib/action-feedback";
import type { AdminUserRow } from "../../lib/phase2-pages";
import { AdminActionFeedback } from "./admin-action-feedback";

type AdminUserRolesProps = Readonly<{
  initialState: ActionFeedbackState;
  locale: Locale;
  users: readonly AdminUserRow[];
}>;

export function AdminUserRoles({
  initialState,
  locale,
  users
}: AdminUserRolesProps) {
  const columns = useMemo<readonly DataTableColumnDef<AdminUserRow>[]>(
    () => [
      {
        accessor: "name",
        header: "Name",
        id: "name"
      },
      {
        accessor: "email",
        header: "Email",
        id: "email"
      },
      {
        accessor: "role",
        filterOptions: [
          {
            label: "Admin",
            value: "admin"
          },
          {
            label: "User",
            value: "user"
          }
        ],
        header: "Role",
        id: "role"
      },
      {
        accessor: "email",
        cell: ({ row }) => {
          const isAdmin = row.role === "admin";
          const buttonLabel = isAdmin ? "Revoke admin" : "Assign admin";

          return (
            <form>
              <input name="roleId" type="hidden" value="admin" />
              <input name="targetUserId" type="hidden" value={row.email} />
              <button type="submit" disabled>
                {buttonLabel}
              </button>
            </form>
          );
        },
        enableSorting: false,
        header: "Action",
        id: "action"
      }
    ],
    []
  );
  const table = useDataTable({
    columns,
    data: users,
    defaultPageSize: 10,
    getRowId: (user) => user.email
  });
  const selectedRows = table.getFilteredSelectedRowModel().rows;

  return (
    <>
      <AdminActionFeedback locale={locale} state={initialState} />
      <DataTableToolbar table={table} searchPlaceholder="Search users">
        <DataTableFacetedFilter
          column={table.getColumn("role")}
          options={columns[2]?.filterOptions ?? []}
          title="Role"
        />
      </DataTableToolbar>
      <DataTable table={table} />
      <DataTablePagination table={table} />
      <DataTableActionBar table={table}>
        <form className="admin-bulk-action-form">
          {selectedRows.map((row) => (
            <input
              key={row.id}
              name="targetUserId"
              type="hidden"
              value={row.original.email}
            />
          ))}
          <label>
            <input name="confirmed" type="checkbox" value="yes" />
            Confirm role change
          </label>
          <button type="submit" disabled>
            Assign admin to selected
          </button>
        </form>
      </DataTableActionBar>
    </>
  );
}

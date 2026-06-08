"use client";

import Link from "next/link";
import { useActionState, useMemo } from "react";
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
  createIdleActionFeedbackState,
  mergeActionFeedbackState,
  type ActionFeedbackState,
  type Locale
} from "../../lib/action-feedback";
import type { AdminUserRow } from "../../lib/phase2-pages";
import { AdminActionFeedback } from "./admin-action-feedback";

type ActionStateHandler = (
  previousState: ActionFeedbackState,
  formData: FormData
) => Promise<ActionFeedbackState>;

type AdminUserRolesProps = Readonly<{
  assignAdminRole: ActionStateHandler;
  bulkAssignAdminRole: ActionStateHandler;
  csrfToken: string;
  initialState: ActionFeedbackState;
  locale: Locale;
  revokeAdminRole: ActionStateHandler;
  users: readonly AdminUserRow[];
}>;

export function AdminUserRoles({
  assignAdminRole,
  bulkAssignAdminRole,
  csrfToken,
  initialState,
  locale,
  revokeAdminRole,
  users
}: AdminUserRolesProps) {
  const [assignState, assignAction, isAssignPending] = useActionState(
    assignAdminRole,
    initialState
  );
  const [revokeState, revokeAction, isRevokePending] = useActionState(
    revokeAdminRole,
    createIdleActionFeedbackState()
  );
  const [bulkState, bulkAction, isBulkPending] = useActionState(
    bulkAssignAdminRole,
    createIdleActionFeedbackState()
  );
  const feedbackState = useMemo(
    () => [bulkState, revokeState, assignState].reduce(mergeActionFeedbackState, initialState),
    [assignState, bulkState, initialState, revokeState]
  );
  const columns = useMemo<readonly DataTableColumnDef<AdminUserRow>[]>(
    () => [
      {
        accessor: "name",
        cell: ({ row }) => (
          <Link className="admin-link" href={`/admin/users/${row.id}/access`}>
            {row.name}
          </Link>
        ),
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
        accessor: "role",
        cell: ({ row }) => {
          const isAdmin = row.role === "admin";
          const buttonLabel = isAdmin ? "Revoke admin" : "Assign admin";
          const formAction = isAdmin ? revokeAction : assignAction;
          const isPending = isAdmin ? isRevokePending : isAssignPending;

          return (
            <form action={formAction} className="admin-inline-form">
              <input name="csrfToken" type="hidden" value={csrfToken} />
              <input name="roleId" type="hidden" value="admin" />
              <input name="targetUserId" type="hidden" value={row.id} />
              <button type="submit" disabled={isPending}>
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
    [assignAction, csrfToken, isAssignPending, isRevokePending, revokeAction]
  );
  const table = useDataTable({
    columns,
    data: users,
    defaultPageSize: 10,
    getRowId: (user) => user.id
  });
  const selectedRows = table.getFilteredSelectedRowModel().rows;

  return (
    <>
      <AdminActionFeedback locale={locale} state={feedbackState} />
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
        <form action={bulkAction} className="admin-bulk-action-form">
          <input name="csrfToken" type="hidden" value={csrfToken} />
          {selectedRows.map((row) => (
            <input
              key={row.id}
              name="targetUserId"
              type="hidden"
              value={row.original.id}
            />
          ))}
          <label>
            <input name="confirmed" type="checkbox" value="yes" />
            Confirm role change
          </label>
          <button type="submit" disabled={isBulkPending}>
            Assign admin to selected
          </button>
        </form>
      </DataTableActionBar>
    </>
  );
}

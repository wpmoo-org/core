"use server";

import { cookies, headers } from "next/headers";
import { actionState } from "../../../lib/action";
import { createAdminPageContext } from "../../../lib/admin-context";
import { createPlaygroundTransaction } from "../../../lib/db";
import {
  createAssignAdminRoleStateOptions,
  createBulkAssignAdminRoleStateOptions,
  createRevokeAdminRoleStateOptions
} from "../../../lib/admin-user-role-actions";
import { authorizeAdminPage } from "../../../lib/phase2-access";
import { csrfCookieName, readClientIpFromHeaders } from "../../../lib/csrf";

async function authorizeAdminMutation(input: {
  action: string;
  resource: string;
}) {
  const context = await createAdminPageContext();

  return authorizeAdminPage(
    {
      action: input.action,
      resource: input.resource
    },
    context
  );
}

async function readCsrfCookie() {
  return (await cookies()).get(csrfCookieName)?.value;
}

async function readClientIp() {
  return readClientIpFromHeaders(await headers());
}

export const assignAdminRole = actionState(
  "admin.users.role.assign",
  createAssignAdminRoleStateOptions({
    authorize: authorizeAdminMutation,
    readClientIp,
    readCsrfCookie,
    transaction: createPlaygroundTransaction
  })
);

export const revokeAdminRole = actionState(
  "admin.users.role.revoke",
  createRevokeAdminRoleStateOptions({
    authorize: authorizeAdminMutation,
    readClientIp,
    readCsrfCookie,
    transaction: createPlaygroundTransaction
  })
);

export const bulkAssignAdminRole = actionState(
  "admin.users.role.bulk_assign",
  createBulkAssignAdminRoleStateOptions({
    authorize: authorizeAdminMutation,
    readClientIp,
    readCsrfCookie,
    transaction: createPlaygroundTransaction
  })
);

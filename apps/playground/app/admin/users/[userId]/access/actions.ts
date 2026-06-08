"use server";

import { cookies, headers } from "next/headers";
import { actionState } from "../../../../../../lib/action";
import { createAdminPageContext } from "../../../../../../lib/admin-context";
import { createUserPermissionOverrideStateOptions } from "../../../../../../lib/admin-permission-actions";
import { csrfCookieName, readClientIpFromHeaders } from "../../../../../../lib/csrf";
import { createPlaygroundTransaction } from "../../../../../../lib/db";
import { authorizeAdminPage } from "../../../../../../lib/phase2-access";

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

export const saveUserPermissionOverride = actionState(
  "admin.users.permissions.override",
  createUserPermissionOverrideStateOptions({
    authorize: authorizeAdminMutation,
    readClientIp,
    readCsrfCookie,
    transaction: createPlaygroundTransaction
  })
);

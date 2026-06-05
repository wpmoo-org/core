import { createAuth } from "@wpmoo/auth/auth";
import { createPlaygroundEnv } from "../config/env";
import { createPlaygroundDatabase } from "./db";

function trustedOriginsFromEnv(env: ReturnType<typeof createPlaygroundEnv>) {
  return [env.NEXT_PUBLIC_APP_URL, env.BETTER_AUTH_URL].filter(
    (origin, index, origins): origin is string =>
      typeof origin === "string" && origin.length > 0 && origins.indexOf(origin) === index
  );
}

export function createPlaygroundAuth() {
  const env = createPlaygroundEnv(process.env);

  return createAuth({
    database: createPlaygroundDatabase(),
    trustedOrigins: trustedOriginsFromEnv(env),
    useSecureCookies: env.NODE_ENV === "production"
  });
}

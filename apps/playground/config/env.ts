import {
  booleanStringSchema,
  nodeEnvSchema,
  requiredInProduction
} from "@wpmoo/config";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export type PlaygroundRuntimeEnv = Partial<
  Record<
    | "ADMIN_BOOTSTRAP_TOKEN"
    | "APP_ENCRYPTION_KEY"
    | "BETTER_AUTH_SECRET"
    | "BETTER_AUTH_URL"
    | "DATABASE_URL"
    | "NEXT_PUBLIC_APP_URL"
    | "NODE_ENV"
    | "REGISTRATION_MODE"
    | "REQUIRE_EMAIL_VERIFICATION",
    string
  >
>;

export function createPlaygroundEnv(runtimeEnv: PlaygroundRuntimeEnv) {
  return createEnv({
    server: {
      DATABASE_URL: z.string().url(),
      BETTER_AUTH_SECRET: z.string().min(32),
      BETTER_AUTH_URL: z.string().url(),
      ADMIN_BOOTSTRAP_TOKEN: z.string().min(32),
      APP_ENCRYPTION_KEY: requiredInProduction(
        z.string().min(32),
        runtimeEnv.NODE_ENV
      ),
      REGISTRATION_MODE: z
        .enum(["public", "invite_only", "disabled"])
        .default("public"),
      REQUIRE_EMAIL_VERIFICATION: booleanStringSchema.default(false)
    },
    client: {
      NEXT_PUBLIC_APP_URL: z.string().url()
    },
    shared: {
      NODE_ENV: nodeEnvSchema.default("development")
    },
    runtimeEnv: {
      ADMIN_BOOTSTRAP_TOKEN: runtimeEnv.ADMIN_BOOTSTRAP_TOKEN,
      APP_ENCRYPTION_KEY: runtimeEnv.APP_ENCRYPTION_KEY,
      BETTER_AUTH_SECRET: runtimeEnv.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: runtimeEnv.BETTER_AUTH_URL,
      DATABASE_URL: runtimeEnv.DATABASE_URL,
      NEXT_PUBLIC_APP_URL: runtimeEnv.NEXT_PUBLIC_APP_URL,
      NODE_ENV: runtimeEnv.NODE_ENV,
      REGISTRATION_MODE: runtimeEnv.REGISTRATION_MODE,
      REQUIRE_EMAIL_VERIFICATION: runtimeEnv.REQUIRE_EMAIL_VERIFICATION
    },
    emptyStringAsUndefined: true
  });
}

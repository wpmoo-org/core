import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const nodeEnvSchema = z.enum(["development", "production", "test"]);

export const booleanStringSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

export function requiredInProduction<T extends z.ZodType>(
  schema: T,
  nodeEnv: string | undefined
) {
  return z.preprocess((value) => {
    if (nodeEnv === "production") {
      return value;
    }

    return value === undefined ? "" : value;
  }, schema.or(z.literal("")));
}

export function createBaseEnv(runtimeEnv: NodeJS.ProcessEnv) {
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
      REGISTRATION_MODE: z.enum(["public", "invite_only", "disabled"]).default("public"),
      REQUIRE_EMAIL_VERIFICATION: booleanStringSchema.default(false)
    },
    shared: {
      NODE_ENV: nodeEnvSchema.default("development"),
      NEXT_PUBLIC_APP_URL: z.string().url()
    },
    runtimeEnv,
    emptyStringAsUndefined: true
  });
}

export type BaseEnv = ReturnType<typeof createBaseEnv>;

import { drizzleAdapter, type DB } from "@better-auth/drizzle-adapter";
import { authSchema } from "@wpmoo/db/schema/auth";
import { betterAuth } from "better-auth";
import { coreVerificationStorage } from "./verification-storage.js";

export type CreateAuthOptions = {
  database: DB;
  trustedOrigins?: string[];
  useSecureCookies: boolean;
};

export function createAuth(options: CreateAuthOptions) {
  return betterAuth(createAuthConfig(options));
}

export function createAuthConfig(options: CreateAuthOptions) {
  return {
    appName: "WPMoo Core",
    database: drizzleAdapter(options.database, {
      provider: "pg",
      schema: authSchema,
      transaction: true
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      storeSessionInDatabase: true,
      updateAge: 60 * 60 * 24
    },
    verification: coreVerificationStorage,
    trustedOrigins: options.trustedOrigins ?? [],
    advanced: {
      useSecureCookies: options.useSecureCookies
    }
  };
}

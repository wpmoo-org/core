import { drizzleAdapter, type DB } from "@better-auth/drizzle-adapter";
import { authSchema } from "@wpmoo/db/schema/auth";
import { betterAuth, type BetterAuthOptions } from "better-auth/minimal";
import { coreVerificationStorage } from "./verification-storage.js";

export type CreateAuthOptions = {
  database: DB;
  trustedOrigins?: string[];
  useSecureCookies: boolean;
};

export type CoreSession = Readonly<{
  emailVerified?: boolean;
  sessionId: string;
  userId: string;
}>;

export type CoreAuth = Readonly<{
  getSession: (headers: Headers) => Promise<CoreSession | null>;
  handler: (request: Request) => Promise<Response>;
}>;

type BetterAuthSessionResponse = Readonly<{
  session?: Readonly<{
    id?: string;
  }> | null;
  user?: Readonly<{
    emailVerified?: boolean;
    id?: string;
  }> | null;
}>;

type BetterAuthRuntime = Readonly<{
  api?: {
    getSession?: (context: {
      asResponse?: false;
      headers: Headers;
    }) => Promise<BetterAuthSessionResponse | null>;
  };
  handler: (request: Request) => Promise<Response>;
}>;

export function createAuth(options: CreateAuthOptions): CoreAuth {
  const auth = betterAuth(createAuthConfig(options)) as unknown as BetterAuthRuntime;

  return {
    async getSession(headers) {
      const session = await auth.api?.getSession?.({
        asResponse: false,
        headers
      });
      const authSession = session?.session;
      const user = session?.user;
      const sessionId = authSession?.id;
      const userId = user?.id;
      const emailVerified = user?.emailVerified;

      if (typeof sessionId !== "string" || typeof userId !== "string") {
        return null;
      }

      return {
        emailVerified,
        sessionId,
        userId
      };
    },
    handler: auth.handler
  };
}

export function createAuthConfig(options: CreateAuthOptions): BetterAuthOptions {
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

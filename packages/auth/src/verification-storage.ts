import { createHash } from "node:crypto";

export const coreVerificationStorage = {
  storeIdentifier: {
    default: "hashed",
    overrides: {
      "email-verification": "hashed",
      "password-reset": "hashed",
      "reset-password": "hashed"
    }
  },
  storeInDatabase: true
} as const;

export const disabledTokenValuePlugins = ["magicLink", "oneTimeToken"] as const;

export async function processVerificationIdentifier(identifier: string): Promise<string> {
  return createHash("sha256").update(identifier).digest("base64url");
}

export async function matchesVerificationIdentifier(
  rawIdentifier: string,
  storedIdentifier: string
): Promise<boolean> {
  return (await processVerificationIdentifier(rawIdentifier)) === storedIdentifier;
}

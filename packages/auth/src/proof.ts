export const pinnedBetterAuthVersion = "1.6.14" as const;

export type ProofColumn = {
  name: string;
  type: "boolean" | "integer" | "text" | "timestamp";
  required: boolean;
  default?: string;
  index?: boolean;
  unique?: boolean;
  references?: string;
  returned?: boolean;
  note?: string;
};

export type ProofTable = {
  name: string;
  columns: ProofColumn[];
};

export type SchemaDiff = {
  table: string;
  column: string;
  kind:
    | "missing-in-contract"
    | "constraint-mismatch"
    | "default-mismatch"
    | "nullability-mismatch"
    | "type-policy-mismatch";
  betterAuth: string;
  coreContract: string;
  decision: string;
};

export const betterAuthPinnedSchema: ProofTable[] = [
  {
    name: "user",
    columns: [
      { name: "id", type: "text", required: true },
      { name: "name", type: "text", required: true },
      { name: "email", type: "text", required: true, unique: true },
      { name: "email_verified", type: "boolean", required: true, default: "false" },
      { name: "image", type: "text", required: false },
      { name: "created_at", type: "timestamp", required: true, default: "now" },
      { name: "updated_at", type: "timestamp", required: true, default: "now" }
    ]
  },
  {
    name: "session",
    columns: [
      { name: "id", type: "text", required: true },
      { name: "expires_at", type: "timestamp", required: true },
      { name: "token", type: "text", required: true, unique: true },
      { name: "created_at", type: "timestamp", required: true, default: "now" },
      { name: "updated_at", type: "timestamp", required: true },
      { name: "ip_address", type: "text", required: false },
      { name: "user_agent", type: "text", required: false },
      {
        name: "user_id",
        type: "text",
        required: true,
        index: true,
        references: "user.id"
      }
    ]
  },
  {
    name: "account",
    columns: [
      { name: "id", type: "text", required: true },
      { name: "account_id", type: "text", required: true },
      { name: "provider_id", type: "text", required: true },
      {
        name: "user_id",
        type: "text",
        required: true,
        index: true,
        references: "user.id"
      },
      { name: "access_token", type: "text", required: false },
      { name: "refresh_token", type: "text", required: false },
      { name: "id_token", type: "text", required: false },
      { name: "access_token_expires_at", type: "timestamp", required: false },
      { name: "refresh_token_expires_at", type: "timestamp", required: false },
      { name: "scope", type: "text", required: false },
      { name: "password", type: "text", required: false },
      { name: "created_at", type: "timestamp", required: true, default: "now" },
      { name: "updated_at", type: "timestamp", required: true }
    ]
  },
  {
    name: "verification",
    columns: [
      { name: "id", type: "text", required: true },
      { name: "identifier", type: "text", required: true, index: true },
      {
        name: "value",
        type: "text",
        required: true,
        note: "Default magic-link token storage is plain unless storeToken is set."
      },
      { name: "expires_at", type: "timestamp", required: true },
      { name: "created_at", type: "timestamp", required: true, default: "now" },
      { name: "updated_at", type: "timestamp", required: true, default: "now" }
    ]
  },
  {
    name: "two_factor",
    columns: [
      { name: "id", type: "text", required: true },
      {
        name: "secret",
        type: "text",
        required: true,
        index: true,
        returned: false
      },
      { name: "backup_codes", type: "text", required: true, returned: false },
      {
        name: "user_id",
        type: "text",
        required: true,
        index: true,
        references: "user.id",
        returned: false
      },
      {
        name: "verified",
        type: "boolean",
        required: false,
        default: "true",
        returned: false
      }
    ]
  },
  {
    name: "passkey",
    columns: [
      { name: "id", type: "text", required: true },
      { name: "name", type: "text", required: false },
      { name: "public_key", type: "text", required: true },
      { name: "user_id", type: "text", required: true, index: true, references: "user.id" },
      { name: "credential_id", type: "text", required: true, index: true },
      { name: "counter", type: "integer", required: true },
      { name: "device_type", type: "text", required: true },
      { name: "backed_up", type: "boolean", required: true },
      { name: "transports", type: "text", required: false },
      { name: "created_at", type: "timestamp", required: false },
      { name: "aaguid", type: "text", required: false }
    ]
  }
];

export const schemaDiffsVsCoreContract: SchemaDiff[] = [
  {
    table: "all auth tables",
    column: "*_at",
    kind: "type-policy-mismatch",
    betterAuth: "Generated Drizzle snapshots use timestamp() without timezone.",
    coreContract: "SCHEMA.md requires timestamp with time zone for absolute instants.",
    decision: "Keep Core Drizzle schema on timestamptz; Better Auth adapter consumes Date values."
  },
  {
    table: "verification",
    column: "created_at / updated_at",
    kind: "nullability-mismatch",
    betterAuth: "Required with default now() in generated schema.",
    coreContract: "Documented as nullable.",
    decision: "Update SCHEMA.md after approval to required timestamps."
  },
  {
    table: "two_factor",
    column: "verified",
    kind: "missing-in-contract",
    betterAuth: "Boolean field added in Better Auth 1.6.x, default true for migrated rows.",
    coreContract: "Not listed.",
    decision: "Add the column before migration generation."
  },
  {
    table: "two_factor",
    column: "user_id",
    kind: "constraint-mismatch",
    betterAuth: "Indexed foreign key; generated relation is many two-factor rows per user.",
    coreContract: "Unique foreign key.",
    decision: "Use Better Auth generated shape until a stricter uniqueness proof is written."
  },
  {
    table: "passkey",
    column: "credential_id",
    kind: "constraint-mismatch",
    betterAuth: "Generated Drizzle snapshot indexes credential_id.",
    coreContract: "Unique credential_id.",
    decision: "Use generated index now; revisit unique constraint after adapter insert behavior is tested."
  },
  {
    table: "passkey",
    column: "counter",
    kind: "default-mismatch",
    betterAuth: "Required integer without a generated default.",
    coreContract: "Required integer default 0.",
    decision: "Use generated no-default shape; Better Auth supplies the authenticator counter."
  },
  {
    table: "passkey",
    column: "device_type / backed_up",
    kind: "nullability-mismatch",
    betterAuth: "Required.",
    coreContract: "Listed without explicit non-null default semantics.",
    decision: "Document both as NOT NULL after approval."
  },
  {
    table: "passkey",
    column: "aaguid",
    kind: "missing-in-contract",
    betterAuth: "Optional Authenticator Attestation GUID.",
    coreContract: "Not listed.",
    decision: "Add optional aaguid after approval."
  }
];

export const tokenPersistenceDecisions = {
  sessionToken: {
    path: "Better Auth database session token remains in session.token for email/password session lookup.",
    control:
      "Treat as bearer-shaped: no length/prefix assumptions, HttpOnly/Secure/SameSite cookies in production, redacted logs, and no client prop exposure."
  },
  verificationAndMagicLinkTokens: {
    path:
      "Configure Better Auth verification/magic-link token storage as hashed before email verification, password reset, or magic-link flows merge.",
    control:
      "Default magic-link storeToken is plain in docs; Core must set storeToken: 'hashed' and keep short expiry plus rate limits."
  },
  oauthProviderTokens: {
    path:
      "Do not persist OAuth access_token, refresh_token, or id_token until a later slice needs offline provider access.",
    control:
      "If persisted later, wrap the Better Auth adapter to encrypt these fields with APP_ENCRYPTION_KEY and a key-version identifier before DB writes."
  },
  totpSecret: {
    path:
      "Do not enable a TOTP flow that writes plaintext two_factor.secret. The schema is present for compatibility, but the flow waits for an encrypted adapter wrapper.",
    control:
      "APP_ENCRYPTION_KEY is required in production once encrypted TOTP storage is enabled."
  },
  backupCodes: {
    path:
      "Backup codes must be one-way hashed before storage in two_factor.backup_codes.",
    control:
      "If the pinned plugin stores plaintext, Core wraps generation/storage before enabling 2FA."
  }
} as const;

export function findProofColumn(tableName: string, columnName: string) {
  const table = betterAuthPinnedSchema.find((candidate) => candidate.name === tableName);

  return table?.columns.find((column) => column.name === columnName);
}

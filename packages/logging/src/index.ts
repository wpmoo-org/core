export const REDACTED_VALUE = "[REDACTED]";

const CIRCULAR_VALUE = "[Circular]";

const SENSITIVE_KEY_PARTS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "access_token",
  "refresh_token",
  "id_token",
  "email",
  "phone",
  "ip_address",
  "ssn"
] as const;

export type LogMetadata = Record<string, unknown>;

export interface Logger {
  info(message: string, metadata?: LogMetadata): void;
  warn(message: string, metadata?: LogMetadata): void;
  error(message: string, metadata?: LogMetadata): void;
}

export function redactSensitiveData<T>(value: T): T {
  return redactValue(value, new WeakSet<object>()) as T;
}

export const logger: Logger = {
  info(message, metadata) {
    writeLog("info", message, metadata);
  },
  warn(message, metadata) {
    writeLog("warn", message, metadata);
  },
  error(message, metadata) {
    writeLog("error", message, metadata);
  }
};

function writeLog(
  method: "info" | "warn" | "error",
  message: string,
  metadata: LogMetadata | undefined
) {
  if (metadata === undefined) {
    console[method](message);
    return;
  }

  // Keep raw request bodies out of log metadata; redaction is key-based by design.
  console[method](message, redactSensitiveData(metadata));
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (seen.has(value)) {
    return CIRCULAR_VALUE;
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const redactedArray = value.map((item) => redactValue(item, seen));
    seen.delete(value);
    return redactedArray;
  }

  const entries = Object.entries(value as Record<string, unknown>).map(
    ([key, child]) => [
      key,
      isSensitiveKey(key) ? REDACTED_VALUE : redactValue(child, seen)
    ]
  );

  seen.delete(value);
  return Object.fromEntries(entries);
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.toLowerCase();

  return SENSITIVE_KEY_PARTS.some((sensitivePart) =>
    normalizedKey.includes(sensitivePart)
  );
}

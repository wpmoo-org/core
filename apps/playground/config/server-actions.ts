export type ServerActionAllowedOriginsEnv = Readonly<
  Partial<
    Record<
      "NEXT_PUBLIC_APP_URL" | "NODE_ENV" | "SERVER_ACTION_ALLOWED_ORIGINS",
      string | undefined
    >
  >
>;

export function getServerActionAllowedOrigins(
  env: NodeJS.ProcessEnv | ServerActionAllowedOriginsEnv
) {
  const appOrigin = normalizeAllowedOrigin(env.NEXT_PUBLIC_APP_URL);
  const configuredOrigins = parseOriginList(env.SERVER_ACTION_ALLOWED_ORIGINS);
  const invalidOrigins = [appOrigin, ...configuredOrigins]
    .map((origin) => origin.invalid)
    .filter((origin): origin is string => origin !== null);

  if (env.NODE_ENV === "production" && invalidOrigins.length > 0) {
    throw new Error(
      `Invalid server action allowed origin(s): ${invalidOrigins.join(", ")}`
    );
  }

  return uniqueOrigins([
    appOrigin.value,
    ...configuredOrigins.map((origin) => origin.value)
  ]);
}

function parseOriginList(rawOrigins: string | undefined) {
  return (rawOrigins ?? "")
    .split(",")
    .map((origin) => normalizeAllowedOrigin(origin));
}

function normalizeAllowedOrigin(origin: string | undefined) {
  const trimmedOrigin = origin?.trim();

  if (trimmedOrigin === undefined || trimmedOrigin.length === 0) {
    return {
      invalid: null,
      value: null
    };
  }

  const wildcardHost = trimmedOrigin.replace(/^https?:\/\//i, "");

  if (/^\*\.[^/\s]+$/.test(wildcardHost)) {
    return {
      invalid: null,
      value: wildcardHost
    };
  }

  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedOrigin)
        ? trimmedOrigin
        : `https://${trimmedOrigin}`
    );

    return {
      invalid: null,
      value: url.host
    };
  } catch {
    return {
      invalid: trimmedOrigin,
      value: null
    };
  }
}

function uniqueOrigins(origins: Array<string | null>) {
  return Array.from(
    new Set(origins.filter((origin): origin is string => origin !== null))
  );
}

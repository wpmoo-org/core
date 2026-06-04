export type ServerActionAllowedOriginsEnv = Readonly<
  Partial<
    Record<
      "NEXT_PUBLIC_APP_URL" | "SERVER_ACTION_ALLOWED_ORIGINS",
      string | undefined
    >
  >
>;

export function getServerActionAllowedOrigins(
  env: NodeJS.ProcessEnv | ServerActionAllowedOriginsEnv
) {
  return uniqueOrigins([
    normalizeAllowedOrigin(env.NEXT_PUBLIC_APP_URL),
    ...parseOriginList(env.SERVER_ACTION_ALLOWED_ORIGINS)
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
    return null;
  }

  const wildcardHost = trimmedOrigin.replace(/^https?:\/\//i, "");

  if (/^\*\.[^/\s]+$/.test(wildcardHost)) {
    return wildcardHost;
  }

  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedOrigin)
        ? trimmedOrigin
        : `https://${trimmedOrigin}`
    );

    return url.host;
  } catch {
    return null;
  }
}

function uniqueOrigins(origins: Array<string | null>) {
  return Array.from(
    new Set(origins.filter((origin): origin is string => origin !== null))
  );
}

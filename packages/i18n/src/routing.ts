export const DEFAULT_LOCALE = "en";
export const LOCALE_PREFIX = "as-needed";

export type LocalePrefix = typeof LOCALE_PREFIX;

export type LocaleEnv = Partial<
  Readonly<{
    NEXT_PUBLIC_DEFAULT_LOCALE: string;
    NEXT_PUBLIC_LOCALES: string;
  }>
>;

export type I18nRoutingConfig = Readonly<{
  defaultLocale: string;
  localePrefix: LocalePrefix;
  locales: readonly string[];
}>;

export function parseLocaleList(
  value: string | undefined,
  fallback: readonly string[] = [DEFAULT_LOCALE]
): string[] {
  const rawLocales =
    value === undefined
      ? fallback
      : value
          .split(",")
          .map((locale) => locale.trim())
          .filter((locale) => locale.length > 0);

  const locales: string[] = [];
  const seen = new Set<string>();

  for (const locale of rawLocales) {
    if (!seen.has(locale)) {
      seen.add(locale);
      locales.push(locale);
    }
  }

  return locales.length > 0 ? locales : [...fallback];
}

export function createI18nRoutingConfig(
  runtimeEnv: LocaleEnv = process.env as LocaleEnv
): I18nRoutingConfig {
  const defaultLocale =
    runtimeEnv.NEXT_PUBLIC_DEFAULT_LOCALE?.trim() || DEFAULT_LOCALE;
  const configuredLocales = parseLocaleList(runtimeEnv.NEXT_PUBLIC_LOCALES, [
    defaultLocale
  ]);
  const locales = [
    defaultLocale,
    ...configuredLocales.filter((locale) => locale !== defaultLocale)
  ];

  return {
    defaultLocale,
    localePrefix: LOCALE_PREFIX,
    locales
  };
}

export const routing = createI18nRoutingConfig();
export type Locale = (typeof routing.locales)[number];

export function isSupportedLocale(
  locale: string,
  routing: I18nRoutingConfig = createI18nRoutingConfig()
): boolean {
  return routing.locales.includes(locale);
}

export function buildLocalizedPath(
  path: string,
  locale: string,
  routing: I18nRoutingConfig = createI18nRoutingConfig()
): string {
  if (!isSupportedLocale(locale, routing)) {
    throw new RangeError(`Unsupported locale: ${locale}`);
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (locale === routing.defaultLocale) {
    return normalizedPath;
  }

  return normalizedPath === "/"
    ? `/${locale}`
    : `/${locale}${normalizedPath}`;
}

export function getLocaleFromPathname(
  pathname: string,
  routing: I18nRoutingConfig = createI18nRoutingConfig()
): string {
  const firstSegment = pathname.split("/").find((segment) => segment.length > 0);

  return firstSegment !== undefined && isSupportedLocale(firstSegment, routing)
    ? firstSegment
    : routing.defaultLocale;
}

import {
  createI18nRoutingConfig,
  getLocaleFromPathname,
  type I18nRoutingConfig
} from "./routing.js";

export type I18nMiddlewareDecision = Readonly<{
  locale: string;
  localized: boolean;
  pathname: string;
}>;

export function resolveI18nMiddleware(
  pathname: string,
  routing: I18nRoutingConfig = createI18nRoutingConfig()
): I18nMiddlewareDecision {
  const locale = getLocaleFromPathname(pathname, routing);
  const firstSegment = pathname.split("/").find((segment) => segment.length > 0);

  return {
    locale,
    localized: firstSegment === locale && locale !== routing.defaultLocale,
    pathname
  };
}

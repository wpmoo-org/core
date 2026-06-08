export const csrfCookieName = "wpmoo_csrf";

export function readRequestCsrfToken(requestHeaders: Headers): string {
  return requestHeaders.get("x-wpmoo-csrf")?.trim() ?? "";
}

export function readClientIpFromHeaders(requestHeaders: Headers): string {
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const realIp = requestHeaders.get("x-real-ip");
  const firstForwardedIp = forwardedFor?.split(",").at(0)?.trim();

  if (firstForwardedIp !== undefined && firstForwardedIp.length > 0) {
    return firstForwardedIp;
  }

  if (realIp !== null && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return "127.0.0.1";
}

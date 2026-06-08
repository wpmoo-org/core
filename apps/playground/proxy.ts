import { NextResponse, type NextRequest } from "next/server";
import { csrfCookieName } from "./lib/csrf";

export function proxy(request: NextRequest) {
  const firstSegment = request.nextUrl.pathname
    .split("/")
    .find((segment) => segment.length > 0);
  const locale = firstSegment === "de" ? "de" : "en";
  const requestHeaders = new Headers(request.headers);
  const csrfToken = request.cookies.get(csrfCookieName)?.value ?? crypto.randomUUID();
  const response = NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });

  requestHeaders.set("x-wpmoo-locale", locale);
  requestHeaders.set("x-wpmoo-csrf", csrfToken);
  response.headers.set("x-wpmoo-locale", locale);

  if (request.cookies.get(csrfCookieName)?.value !== csrfToken) {
    response.cookies.set(csrfCookieName, csrfToken, {
      httpOnly: false,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:"
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|.*\..*).*)"]
};

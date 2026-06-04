import { NextResponse, type NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const response = NextResponse.next();
  const firstSegment = request.nextUrl.pathname
    .split("/")
    .find((segment) => segment.length > 0);

  response.headers.set("x-wpmoo-locale", firstSegment === "de" ? "de" : "en");

  return response;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"]
};

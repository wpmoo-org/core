async function handleAuth(request: Request) {
  const { auth } = await import("../../../../lib/auth");

  return auth.handler(request);
}

export const GET = handleAuth;
export const POST = handleAuth;

async function handleAuth(request: Request) {
  const { createPlaygroundAuth } = await import("../../../../lib/auth");

  return createPlaygroundAuth().handler(request);
}

export const GET = handleAuth;
export const POST = handleAuth;

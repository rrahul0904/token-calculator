import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function authConfigured(): boolean {
  return Boolean(
    process.env.WORKOS_API_KEY &&
      process.env.WORKOS_CLIENT_ID &&
      process.env.WORKOS_COOKIE_PASSWORD &&
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI,
  );
}

export default async function proxy(request: NextRequest) {
  if (!authConfigured()) return NextResponse.next();

  const { authkit, handleAuthkitHeaders } = await import("@workos-inc/authkit-nextjs");
  const { session, headers, authorizationUrl } = await authkit(request);

  if (request.nextUrl.pathname.startsWith("/app") && !session.user && authorizationUrl) {
    return handleAuthkitHeaders(request, headers, { redirect: authorizationUrl });
  }

  return handleAuthkitHeaders(request, headers);
}

export const config = {
  matcher: ["/app/:path*"],
};

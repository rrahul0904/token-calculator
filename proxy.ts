import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getConfigurationStatus } from "@/lib/config";
import { workosRedirectUriForRequest } from "@/lib/auth/redirect-uri";

export default async function proxy(request: NextRequest) {
  if (getConfigurationStatus().auth !== "live") return NextResponse.next();

  const { authkit, handleAuthkitHeaders } = await import("@workos-inc/authkit-nextjs");
  const { session, headers, authorizationUrl } = await authkit(request, {
    redirectUri: workosRedirectUriForRequest(request.nextUrl.origin),
  });

  if (request.nextUrl.pathname.startsWith("/app") && !session.user && authorizationUrl) {
    return handleAuthkitHeaders(request, headers, { redirect: authorizationUrl });
  }

  return handleAuthkitHeaders(request, headers);
}

export const config = {
  matcher: ["/app/:path*", "/sign-in"],
};

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getConfigurationStatus } from "@/lib/config";
import { workosRedirectUriForRequest } from "@/lib/auth/redirect-uri";

export default async function proxy(request: NextRequest) {
  const e2eSecret = process.env.TOKEN_INTELLIGENCE_E2E_AUTH_SECRET;
  if (process.env.TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED === "1" && e2eSecret && request.headers.get("x-ti-e2e-auth") === e2eSecret) {
    return NextResponse.next();
  }
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

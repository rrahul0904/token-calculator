import type { NextRequest } from "next/server";
import { getConfigurationStatus, requiredConfiguration } from "@/lib/config";

export const GET = async (request: NextRequest) => {
  if (getConfigurationStatus().auth !== "live") {
    return Response.json(
      {
        error: "AUTH_NOT_CONFIGURED",
        message: "WorkOS AuthKit is code-complete but configuration-blocked.",
        required: requiredConfiguration("auth"),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code || !state) {
    return Response.json(
      { error: "INVALID_AUTH_CALLBACK", message: "The authentication callback is missing required OAuth state." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const { handleAuth } = await import("@workos-inc/authkit-nextjs");
    return await handleAuth({
      returnPathname: "/app/overview",
      baseURL: request.nextUrl.origin,
    })(request);
  } catch {
    return Response.json(
      { error: "AUTH_CALLBACK_FAILED", message: "The authentication callback could not be verified." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
};

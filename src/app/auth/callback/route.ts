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
  const { handleAuth } = await import("@workos-inc/authkit-nextjs");
  return handleAuth({ returnPathname: "/app/overview" })(request);
};

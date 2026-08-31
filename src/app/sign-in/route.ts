import { redirect } from "next/navigation";
import { getConfigurationStatus, requiredConfiguration } from "@/lib/config";

export const GET = async () => {
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
  const { getSignInUrl } = await import("@workos-inc/authkit-nextjs");
  redirect(await getSignInUrl());
};

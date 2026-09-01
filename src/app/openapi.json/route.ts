import { OPENAPI_DOCUMENT } from "@/lib/openapi";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(OPENAPI_DOCUMENT, { headers: { "Cache-Control": "public, max-age=300" } });
}

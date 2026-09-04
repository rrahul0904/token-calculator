import { consumePublicRateLimit } from "@/lib/http/public-rate-limit";
import * as z from "zod";
import { computeCostQualityFrontier } from "@/lib/economics/workload";
import { frontierCandidateSchema } from "@/lib/economics/schemas";

const schema = z.object({ candidates: z.array(frontierCandidateSchema).min(1).max(500) });

export async function POST(request: Request) {
  const rate = consumePublicRateLimit(request, "economics-frontier");
  if (!rate.allowed) return Response.json({ error: "RATE_LIMITED" }, { status: 429, headers: { ...rate.headers, "Cache-Control": "no-store" } });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.issues }, { status: 400, headers: { ...rate.headers, "Cache-Control": "no-store" } });
  return Response.json({
    data: computeCostQualityFrontier(parsed.data.candidates),
    evidenceRule: "Candidates without an explicit quality score and source URL are omitted from the quality frontier.",
  }, { headers: { ...rate.headers, "Cache-Control": "no-store" } });
}
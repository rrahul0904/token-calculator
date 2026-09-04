import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { diffPricingCatalog, hasMaterialPricingChanges } from "../src/lib/pricing-sources/diff";
import { normalizeCatalog } from "../src/lib/pricing-sources/normalize";
import type { NormalizedPricingModel } from "../src/lib/pricing-sources/types";

async function main() {
  const args = process.argv.slice(2);
  const failOnChange = args.includes("--fail-on-change");
  const candidatePath = args.find((arg) => !arg.startsWith("--"));
  const current = normalizeCatalog();
  let candidate: NormalizedPricingModel[] = current;

  if (candidatePath) {
    const parsed = JSON.parse(await readFile(resolve(process.cwd(), candidatePath), "utf8")) as unknown;
    candidate = Array.isArray(parsed)
      ? parsed as NormalizedPricingModel[]
      : (parsed && typeof parsed === "object" && Array.isArray((parsed as { data?: unknown }).data))
        ? (parsed as { data: NormalizedPricingModel[] }).data
        : (() => { throw new Error("Candidate pricing snapshot must be an array or { data: [...] }."); })();
  }

  const diffs = diffPricingCatalog(current, candidate);
  process.stdout.write(JSON.stringify({
    generatedAt: new Date().toISOString(),
    candidate: candidatePath ?? "canonical-self-check",
    materialChanges: hasMaterialPricingChanges(diffs),
    diffs,
  }, null, 2) + "\n");

  if (failOnChange && hasMaterialPricingChanges(diffs)) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

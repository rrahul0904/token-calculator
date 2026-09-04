import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OPENAPI_DOCUMENT } from "@/lib/openapi";

function routeFileForPath(path: string) {
  const segments = path.split("/").filter(Boolean).map((segment) => {
    const parameter = /^\{(.+)\}$/.exec(segment);
    return parameter ? `[${parameter[1]}]` : segment;
  });
  return resolve(process.cwd(), "src", "app", ...segments, "route.ts");
}

describe("OpenAPI implementation contract", () => {
  it("uses OpenAPI 3.1 and preserves measurement provenance", () => {
    expect(OPENAPI_DOCUMENT.openapi).toBe("3.1.0");
    expect(OPENAPI_DOCUMENT.components.schemas.UsageSource.enum).toEqual([
      "provider_measured",
      "agent_measured",
      "local_tokenizer_reference",
      "estimated",
      "reconciled",
    ]);
  });

  it("documents the workload economics and endpoint-pricing surfaces", () => {
    expect(OPENAPI_DOCUMENT.paths["/api/v1/economics/estimate"]).toBeTruthy();
    expect(OPENAPI_DOCUMENT.paths["/api/v1/economics/reverse"]).toBeTruthy();
    expect(OPENAPI_DOCUMENT.paths["/api/v1/economics/frontier"]).toBeTruthy();
    expect(OPENAPI_DOCUMENT.paths["/api/v1/pricing"]).toBeTruthy();
    expect(OPENAPI_DOCUMENT.paths["/api/v1/models/{id}/endpoints"]).toBeTruthy();
  });

  it("does not document API paths that have no route implementation", () => {
    const missing = Object.keys(OPENAPI_DOCUMENT.paths).filter((path) => !existsSync(routeFileForPath(path)));
    expect(missing).toEqual([]);
  });
});

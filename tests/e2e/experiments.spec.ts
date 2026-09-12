import { expect, test } from "@playwright/test";

const e2eSecret = process.env.TOKEN_INTELLIGENCE_E2E_AUTH_SECRET;
const authenticated = Boolean(e2eSecret && process.env.TOKEN_INTELLIGENCE_E2E_AUTH_ENABLED === "1");
const authHeaders: Record<string, string> = e2eSecret ? { "x-ti-e2e-auth": e2eSecret } : {};

test.describe("experiment lifecycle", () => {
  test.skip(!authenticated, "Explicit E2E auth adapter is not enabled.");
  test.use({ extraHTTPHeaders: authHeaders });

  for (const path of ["/app/experiments", "/app/findings", "/app/route-lab"]) {
    test(`${path} renders for the seeded owner`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator("body")).not.toContainText(/internal server error/i);
    });
  }

  test("dataset, cases, experiment evidence and deterministic savings gate work end to end", async ({ request }) => {
    const suffix = Date.now();
    const datasetResponse = await request.post("/api/v1/evaluation-datasets", {
      data: { name: `Release dataset ${suffix}`, version: "1", projectId: "proj_e2e", contentRetentionMode: "metadata_only" },
    });
    expect(datasetResponse.status()).toBe(201);
    const dataset = (await datasetResponse.json()).data as { id: string };

    const caseResponse = await request.post(`/api/v1/evaluation-datasets/${dataset.id}/cases`, {
      data: { inputReference: `fixture-${suffix}`, expectedOutcome: { testsPassed: true }, tags: ["release"], metadata: { suite: "playwright" } },
    });
    expect(caseResponse.status()).toBe(201);
    const evaluationCase = (await caseResponse.json()).data as { id: string };

    const experimentResponse = await request.post("/api/v1/experiments", {
      data: {
        name: `Release experiment ${suffix}`,
        datasetId: dataset.id,
        projectId: "proj_e2e",
        baselineConfig: { model: "gpt-5.6-sol" },
        candidateConfig: { model: "gpt-5.6-luna" },
        qualityThreshold: 0.8,
        maxCostRegressionPct: 0,
      },
    });
    expect(experimentResponse.status()).toBe(201);
    const experiment = (await experimentResponse.json()).data as { id: string };

    for (let index = 0; index < 5; index += 1) {
      const baseline = await request.post(`/api/v1/experiments/${experiment.id}/results`, {
        data: { variant: "baseline", caseId: evaluationCase.id, qualityScore: 0.95, costUsd: 1, tokens: 1000, latencyMs: 500, retries: 0, fallbacks: 0, success: true },
      });
      expect(baseline.status()).toBe(201);

      const candidate = await request.post(`/api/v1/experiments/${experiment.id}/results`, {
        data: { variant: "candidate", caseId: evaluationCase.id, qualityScore: 0.95, costUsd: 0.5, tokens: 900, latencyMs: 450, retries: 0, fallbacks: 0, success: true },
      });
      expect(candidate.status()).toBe(201);
    }

    const completed = await request.patch(`/api/v1/experiments/${experiment.id}`, { data: { status: "completed" } });
    expect(completed.status()).toBe(200);

    const gateResponse = await request.get(`/api/v1/experiments/${experiment.id}/gate`);
    expect(gateResponse.status()).toBe(200);
    const gate = (await gateResponse.json()).data;
    expect(gate.passed).toBe(true);
    expect(gate.evidenceType).toBe("experiment_verified");
    expect(gate.successPassed).toBe(true);
    expect(gate.costImproved).toBe(true);
    expect(gate.baseline.sampleSize).toBe(5);
    expect(gate.candidate.sampleSize).toBe(5);

    const detailResponse = await request.get(`/api/v1/experiments/${experiment.id}`);
    expect(detailResponse.status()).toBe(200);
    const detail = (await detailResponse.json()).data;
    expect(detail.results).toHaveLength(10);
  });

  test("experiment metadata rejects retained prompt content", async ({ request }) => {
    const suffix = Date.now();
    const datasetResponse = await request.post("/api/v1/evaluation-datasets", { data: { name: `Privacy dataset ${suffix}`, version: "1" } });
    expect(datasetResponse.status()).toBe(201);
    const dataset = (await datasetResponse.json()).data as { id: string };

    const rejected = await request.post("/api/v1/experiments", {
      data: {
        name: `Unsafe experiment ${suffix}`,
        datasetId: dataset.id,
        baselineConfig: { prompt: "do not persist me" },
        candidateConfig: { model: "gpt-5.6-luna" },
      },
    });
    expect(rejected.status()).toBe(400);
    expect((await rejected.json()).error).toBe("CONTENT_RETENTION_DISABLED");
  });
});

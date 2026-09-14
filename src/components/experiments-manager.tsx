"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Dataset = { id: string; name: string; version: string; caseCount: number };
type Experiment = { id: string; name: string; datasetId: string; status: string; resultCount: number };
type GateResult = {
  passed: boolean;
  evidenceType: string;
  baseline?: { sampleSize: number; qualityScore: number | null; medianCostUsd: number | null; successRate: number | null };
  candidate?: { sampleSize: number; qualityScore: number | null; medianCostUsd: number | null; successRate: number | null };
};
type ApiBody = { data?: unknown; error?: string };

async function json(response: Response): Promise<ApiBody | null> {
  return response.json().catch(() => null) as Promise<ApiBody | null>;
}

function dataObject(body: ApiBody | null): Record<string, unknown> | null {
  const value = body?.data;
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function ExperimentsManager({ canManage }: { canManage: boolean }) {
  const router = useRouter();
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [datasetId, setDatasetId] = useState("");
  const [experimentId, setExperimentId] = useState("");
  const [datasetName, setDatasetName] = useState("");
  const [datasetVersion, setDatasetVersion] = useState("1");
  const [caseReference, setCaseReference] = useState("");
  const [experimentName, setExperimentName] = useState("");
  const [baselineModel, setBaselineModel] = useState("");
  const [candidateModel, setCandidateModel] = useState("");
  const [variant, setVariant] = useState<"baseline" | "candidate">("baseline");
  const [quality, setQuality] = useState("1");
  const [cost, setCost] = useState("0");
  const [success, setSuccess] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [gate, setGate] = useState<GateResult | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedDataset = useMemo(() => datasets.find((item) => item.id === datasetId) ?? null, [datasetId, datasets]);
  const selectedExperiment = useMemo(() => experiments.find((item) => item.id === experimentId) ?? null, [experimentId, experiments]);

  const load = useCallback(async () => {
    const [datasetsResponse, experimentsResponse] = await Promise.all([
      fetch("/api/v1/evaluation-datasets", { cache: "no-store" }),
      fetch("/api/v1/experiments", { cache: "no-store" }),
    ]);
    const [datasetBody, experimentBody] = await Promise.all([json(datasetsResponse), json(experimentsResponse)]);
    if (datasetsResponse.ok) {
      const next = (datasetBody?.data ?? []) as Dataset[];
      setDatasets(next);
      setDatasetId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? "");
    }
    if (experimentsResponse.ok) {
      const next = (experimentBody?.data ?? []) as Experiment[];
      setExperiments(next);
      setExperimentId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? "");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setGate(null); }, [experimentId]);

  async function execute(action: () => Promise<void>) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function createDataset() {
    await execute(async () => {
      const response = await fetch("/api/v1/evaluation-datasets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: datasetName, version: datasetVersion || "1", contentRetentionMode: "metadata_only" }),
      });
      const body = await json(response);
      if (!response.ok) throw new Error(String(body?.error ?? "Dataset creation failed"));
      const createdId = String(dataObject(body)?.id ?? "");
      setDatasetName("");
      setDatasetVersion("1");
      setMessage("Evaluation dataset created.");
      await load();
      setDatasetId(createdId);
      router.refresh();
    });
  }

  async function addCase() {
    if (!datasetId) return;
    await execute(async () => {
      const response = await fetch(`/api/v1/evaluation-datasets/${encodeURIComponent(datasetId)}/cases`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputReference: caseReference, expectedOutcome: {}, tags: [], metadata: {} }),
      });
      const body = await json(response);
      if (!response.ok) throw new Error(String(body?.error ?? "Case creation failed"));
      setCaseReference("");
      setMessage("Evaluation case added without storing prompt content.");
      await load();
      router.refresh();
    });
  }

  async function createExperiment() {
    if (!datasetId) return;
    await execute(async () => {
      const response = await fetch("/api/v1/experiments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: experimentName,
          datasetId,
          baselineConfig: { model: baselineModel || "baseline" },
          candidateConfig: { model: candidateModel || "candidate" },
          qualityThreshold: 0.8,
          maxCostRegressionPct: 0,
        }),
      });
      const body = await json(response);
      if (!response.ok) throw new Error(String(body?.error ?? "Experiment creation failed"));
      const createdId = String(dataObject(body)?.id ?? "");
      setExperimentName("");
      setBaselineModel("");
      setCandidateModel("");
      setMessage("Experiment created.");
      await load();
      setExperimentId(createdId);
      router.refresh();
    });
  }

  async function recordResult() {
    if (!experimentId) return;
    await execute(async () => {
      const qualityScore = Number(quality);
      const costUsd = Number(cost);
      if (!Number.isFinite(qualityScore) || qualityScore < 0 || qualityScore > 1) throw new Error("Quality must be between 0 and 1.");
      if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("Cost must be zero or greater.");
      const response = await fetch(`/api/v1/experiments/${encodeURIComponent(experimentId)}/results`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ variant, qualityScore, costUsd, success, retries: 0, fallbacks: 0 }),
      });
      const body = await json(response);
      if (!response.ok) throw new Error(String(body?.error ?? "Result creation failed"));
      setMessage(`${variant === "baseline" ? "Baseline" : "Candidate"} observation recorded.`);
      setGate(null);
      await load();
      router.refresh();
    });
  }

  async function completeAndEvaluate() {
    if (!experimentId) return;
    await execute(async () => {
      const completed = await fetch(`/api/v1/experiments/${encodeURIComponent(experimentId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const completedBody = await json(completed);
      if (!completed.ok) throw new Error(String(completedBody?.error ?? "Experiment completion failed"));

      const response = await fetch(`/api/v1/experiments/${encodeURIComponent(experimentId)}/gate`, { cache: "no-store" });
      const body = await json(response);
      if (!response.ok) throw new Error(String(body?.error ?? "Gate evaluation failed"));
      const gateData = dataObject(body) as GateResult | null;
      setGate(gateData);
      setMessage(gateData?.passed ? "Experiment verified: candidate is cheaper without quality/success regression." : "Experiment is not yet a verified savings claim.");
      await load();
      router.refresh();
    });
  }

  return (
    <section className="app-panel">
      <div className="app-panel__header">
        <div>
          <h2>Experiment workbench</h2>
          <p>Create versioned metadata-only evaluation datasets, record controlled baseline/candidate evidence, and run a deterministic savings gate.</p>
        </div>
      </div>
      <div className="app-panel__body app-stack">
        {!canManage ? (
          <p>You can inspect experiment evidence, but your organization role cannot create or modify experiments.</p>
        ) : (
          <>
            <div className="app-grid">
              <section className="app-panel">
                <div className="app-panel__header"><div><h3>1. Dataset</h3><p>References only; prompt/code content is not stored.</p></div></div>
                <div className="app-panel__body app-stack">
                  <div className="form-row"><label htmlFor="experiment-dataset-name">Dataset name</label><input id="experiment-dataset-name" value={datasetName} onChange={(event) => setDatasetName(event.target.value)} placeholder="Repository change quality" /></div>
                  <div className="form-row"><label htmlFor="experiment-dataset-version">Version</label><input id="experiment-dataset-version" value={datasetVersion} onChange={(event) => setDatasetVersion(event.target.value)} /></div>
                  <div className="form-actions"><button className="button button--primary" type="button" disabled={busy || datasetName.trim().length < 2} onClick={() => void createDataset()}>Create dataset</button></div>
                  <div className="form-row"><label htmlFor="experiment-dataset-select">Selected dataset</label><select id="experiment-dataset-select" value={datasetId} onChange={(event) => setDatasetId(event.target.value)}><option value="">Choose dataset</option>{datasets.map((item) => <option key={item.id} value={item.id}>{item.name} · v{item.version} · {item.caseCount} cases</option>)}</select></div>
                  <div className="form-row"><label htmlFor="experiment-case-reference">Case reference</label><input id="experiment-case-reference" value={caseReference} onChange={(event) => setCaseReference(event.target.value)} placeholder="issue-123 / fixture-abc / eval-case-07" /><small>Store an identifier or URI, not raw task content.</small></div>
                  <div className="form-actions"><button className="button button--ghost" type="button" disabled={busy || !datasetId || !caseReference.trim()} onClick={() => void addCase()}>Add case</button></div>
                </div>
              </section>

              <section className="app-panel">
                <div className="app-panel__header"><div><h3>2. Experiment</h3><p>Compare the same evaluation workload under two controlled configurations.</p></div></div>
                <div className="app-panel__body app-stack">
                  <div className="form-row"><label htmlFor="experiment-name">Experiment name</label><input id="experiment-name" value={experimentName} onChange={(event) => setExperimentName(event.target.value)} placeholder="Cheaper route with equal quality" /></div>
                  <div className="form-row"><label htmlFor="baseline-model">Baseline config label</label><input id="baseline-model" value={baselineModel} onChange={(event) => setBaselineModel(event.target.value)} placeholder="gpt-5.6-sol" /></div>
                  <div className="form-row"><label htmlFor="candidate-model">Candidate config label</label><input id="candidate-model" value={candidateModel} onChange={(event) => setCandidateModel(event.target.value)} placeholder="gpt-5.6-luna" /></div>
                  <div className="form-actions"><button className="button button--primary" type="button" disabled={busy || !datasetId || experimentName.trim().length < 2} onClick={() => void createExperiment()}>Create experiment</button></div>
                  <div className="form-row"><label htmlFor="experiment-select">Selected experiment</label><select id="experiment-select" value={experimentId} onChange={(event) => setExperimentId(event.target.value)}><option value="">Choose experiment</option>{experiments.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.status} · {item.resultCount} observations</option>)}</select></div>
                </div>
              </section>
            </div>

            <section className="app-panel">
              <div className="app-panel__header"><div><h3>3. Evidence</h3><p>Verification requires at least five baseline and five candidate observations, completed status, non-inferior success/quality, and lower median cost.</p></div></div>
              <div className="app-panel__body app-stack">
                <div className="form-grid">
                  <div className="form-row"><label htmlFor="experiment-variant">Variant</label><select id="experiment-variant" value={variant} onChange={(event) => setVariant(event.target.value as "baseline" | "candidate")}><option value="baseline">Baseline</option><option value="candidate">Candidate</option></select></div>
                  <div className="form-row"><label htmlFor="experiment-quality">Quality score</label><input id="experiment-quality" type="number" min="0" max="1" step="0.01" value={quality} onChange={(event) => setQuality(event.target.value)} /></div>
                  <div className="form-row"><label htmlFor="experiment-cost">Cost USD</label><input id="experiment-cost" type="number" min="0" step="0.0001" value={cost} onChange={(event) => setCost(event.target.value)} /></div>
                  <div className="form-row"><label htmlFor="experiment-success">Outcome</label><select id="experiment-success" value={success ? "success" : "failure"} onChange={(event) => setSuccess(event.target.value === "success")}><option value="success">Verified success</option><option value="failure">Failure</option></select></div>
                </div>
                <div className="form-actions">
                  <button className="button button--ghost" type="button" disabled={busy || !experimentId} onClick={() => void recordResult()}>Record observation</button>
                  <button className="button button--primary" type="button" disabled={busy || !experimentId} onClick={() => void completeAndEvaluate()}>Complete + evaluate gate</button>
                </div>
                {gate ? (
                  <div className="finding">
                    <div className="finding__top">
                      <div><strong>{gate.passed ? "Verified savings" : "Not verified"}</strong><p>{gate.evidenceType} · baseline n={gate.baseline?.sampleSize ?? 0} · candidate n={gate.candidate?.sampleSize ?? 0}</p></div>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </>
        )}
        <small role="status">{message}</small>
        {selectedDataset && selectedExperiment ? <small>Active dataset: {selectedDataset.name} v{selectedDataset.version} · Active experiment: {selectedExperiment.name}</small> : null}
      </div>
    </section>
  );
}

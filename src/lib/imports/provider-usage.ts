import { createHash } from "node:crypto";

export interface ProviderUsageRow {
  provider: string;
  periodStart: string;
  periodEnd: string;
  costUsd: number | null;
  model: string | null;
  user: string | null;
  apiKey: string | null;
  project: string | null;
  runId: string | null;
  tokens: number | null;
  sourceRow: number;
}

export interface ProviderUsagePreview {
  sourceHash: string;
  sourceIdentity: string;
  format: "csv" | "json";
  rowCount: number;
  validRows: ProviderUsageRow[];
  errors: Array<{ row: number; message: string }>;
  totalCostUsd: number | null;
  provenance: "provider_imported";
  attribution: { runAttributedCostUsd: number; unattributedCostUsd: number | null; runAttributionCoveragePct: number | null };
}

function normalizedKey(key: string) { return key.trim().toLowerCase().replace(/[\s.-]+/g, "_"); }
function optionalString(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : null; }
function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { cells.push(current); current = ""; }
    else current += char;
  }
  if (quoted) throw new Error("UNTERMINATED_CSV_QUOTE");
  cells.push(current);
  return cells;
}

function parseCsv(text: string): Record<string, unknown>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]).map(normalizedKey);
  return lines.slice(1).map((line) => Object.fromEntries(splitCsvLine(line).map((value, index) => [headers[index] ?? `column_${index + 1}`, value])));
}

function parseJson(text: string): Record<string, unknown>[] {
  const value = JSON.parse(text) as unknown;
  const rows = Array.isArray(value) ? value : value && typeof value === "object" && Array.isArray((value as { rows?: unknown }).rows) ? (value as { rows: unknown[] }).rows : null;
  if (!rows) throw new Error("JSON_IMPORT_MUST_BE_ARRAY_OR_ROWS_ARRAY");
  return rows.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error(`INVALID_JSON_ROW:${index + 1}`);
    return Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, child]) => [normalizedKey(key), child]));
  });
}

function first(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (row[key] !== undefined) return row[key];
  return undefined;
}

function normalizeRow(row: Record<string, unknown>, index: number, providerHint?: string): ProviderUsageRow {
  const provider = optionalString(first(row, ["provider", "vendor"])) ?? providerHint ?? "unknown";
  const periodStart = optionalString(first(row, ["period_start", "start", "start_time", "date", "usage_date"]));
  const periodEnd = optionalString(first(row, ["period_end", "end", "end_time", "date", "usage_date"]));
  if (!periodStart || !periodEnd) throw new Error("PERIOD_REQUIRED");
  if (Number.isNaN(Date.parse(periodStart)) || Number.isNaN(Date.parse(periodEnd))) throw new Error("INVALID_PERIOD");
  const costUsd = optionalNumber(first(row, ["cost_usd", "cost", "amount_usd", "amount"]));
  const tokens = optionalNumber(first(row, ["tokens", "total_tokens", "usage_tokens"]));
  return {
    provider,
    periodStart: new Date(periodStart).toISOString(),
    periodEnd: new Date(periodEnd).toISOString(),
    costUsd,
    model: optionalString(first(row, ["model", "model_id"])),
    user: optionalString(first(row, ["user", "user_id", "email"])),
    apiKey: optionalString(first(row, ["api_key_id", "api_key", "key_id"])),
    project: optionalString(first(row, ["project", "project_id"])),
    runId: optionalString(first(row, ["run_id", "request_id", "trace_id"])),
    tokens: tokens === null ? null : Math.floor(tokens),
    sourceRow: index + 1,
  };
}

export function previewProviderUsageImport(text: string, options: { sourceIdentity: string; provider?: string; format?: "csv" | "json" }): ProviderUsagePreview {
  if (text.length > 10_000_000) throw new Error("IMPORT_TOO_LARGE");
  const format = options.format ?? (text.trimStart().startsWith("[") || text.trimStart().startsWith("{") ? "json" : "csv");
  const rawRows = format === "json" ? parseJson(text) : parseCsv(text);
  const sourceHash = createHash("sha256").update(text).digest("hex");
  const validRows: ProviderUsageRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];
  rawRows.forEach((row, index) => {
    try { validRows.push(normalizeRow(row, index, options.provider)); }
    catch (error) { errors.push({ row: index + 1, message: error instanceof Error ? error.message : "INVALID_ROW" }); }
  });
  const knownCosts = validRows.flatMap((row) => row.costUsd === null ? [] : [row.costUsd]);
  const totalCostUsd = knownCosts.length ? knownCosts.reduce((sum, value) => sum + value, 0) : null;
  const runAttributedCostUsd = validRows.filter((row) => row.runId && row.costUsd !== null).reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
  const unattributedCostUsd = totalCostUsd === null ? null : Math.max(0, totalCostUsd - runAttributedCostUsd);
  const runAttributionCoveragePct = totalCostUsd && totalCostUsd > 0 ? runAttributedCostUsd / totalCostUsd * 100 : null;
  return { sourceHash, sourceIdentity: options.sourceIdentity, format, rowCount: rawRows.length, validRows, errors, totalCostUsd, provenance: "provider_imported", attribution: { runAttributedCostUsd, unattributedCostUsd, runAttributionCoveragePct } };
}

export function assertImportCommitSafe(preview: ProviderUsagePreview, existingSourceHashes: Iterable<string>) {
  if (preview.errors.length) throw new Error("IMPORT_HAS_INVALID_ROWS");
  if (new Set(existingSourceHashes).has(preview.sourceHash)) throw new Error("DUPLICATE_PROVIDER_USAGE_IMPORT");
  if (!preview.validRows.length) throw new Error("IMPORT_HAS_NO_VALID_ROWS");
}

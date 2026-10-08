export type LiveContextZone = "stable_prefix" | "live_zone";
export type LiveContextKind = "json" | "log" | "search" | "text" | "code" | "unknown";
export type LiveContextTransformStatus =
  | "transformed"
  | "protected_cache_prefix"
  | "code_opt_in_required"
  | "insufficient_savings"
  | "no_safe_transform";

export interface LiveContextBlock {
  id: string;
  zone: LiveContextZone;
  content: string;
  kind?: LiveContextKind;
}

export interface LiveContextTransformOptions {
  allowCode?: boolean;
  minimumEstimatedSavingsTokens?: number;
}

export interface LiveContextTransformReceipt {
  blockId: string;
  zone: LiveContextZone;
  detectedKind: LiveContextKind;
  status: LiveContextTransformStatus;
  content: string;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
  estimatedTokensSaved: number;
  estimateOnly: true;
  cachePrefixPreserved: boolean;
  recoverable: boolean;
  recoveryRef: string | null;
  transform: string | null;
}

/**
 * Process-local recovery store for reversible context transforms.
 *
 * The original payload never needs to travel with the compressed request. The
 * caller owns the lifetime of this store; it is intentionally in-memory only
 * and has no persistence or network behavior. Recovery handles are deliberately
 * opaque and contain no caller-provided block IDs. They are local lookup keys,
 * not authentication secrets.
 */
export class LocalContextRecoveryStore {
  private readonly originals = new Map<string, string>();
  private sequence = 0;

  put(original: string): string {
    this.sequence += 1;
    const ref = `ctx:${this.sequence.toString(36)}`;
    this.originals.set(ref, original);
    return ref;
  }

  get(ref: string): string | null {
    return this.originals.get(ref) ?? null;
  }

  delete(ref: string): boolean {
    return this.originals.delete(ref);
  }

  clear(): void {
    this.originals.clear();
  }

  get size(): number {
    return this.originals.size;
  }
}

/**
 * Cheap deterministic estimate used only as a local pre-filter. It is not a
 * provider tokenizer and must never be persisted or displayed as measured
 * token usage.
 */
export function estimateContextTokens(content: string): number {
  if (!content) return 0;
  return Math.max(1, Math.ceil(content.length / 4));
}

export function detectLiveContextKind(content: string): LiveContextKind {
  const trimmed = content.trim();
  if (!trimmed) return "unknown";

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      // Fall through to conservative heuristics.
    }
  }

  const lines = trimmed.split(/\r?\n/);
  const logSignals = lines.filter((line) =>
    /(?:^|\s)(?:TRACE|DEBUG|INFO|WARN|WARNING|ERROR|FATAL)(?:\s|:|$)/i.test(line) ||
    /^\s*\d{4}-\d{2}-\d{2}[T\s]/.test(line) ||
    /\x1b\[[0-9;]*m/.test(line),
  ).length;
  if (lines.length >= 2 && logSignals >= Math.min(2, lines.length)) return "log";

  const searchSignals = lines.filter((line) =>
    /^\s*(?:https?:\/\/|\d+[.)]\s|title\s*:|url\s*:|snippet\s*:)/i.test(line),
  ).length;
  if (lines.length >= 2 && searchSignals >= Math.min(2, lines.length)) return "search";

  const codeSignals = [
    /\b(?:import|export|interface|class|function|const|let|var)\b/,
    /\b(?:def|from|async def|class)\s+[A-Za-z_]/,
    /(?:=>|===|!==|\{\s*$|;\s*$)/m,
  ].filter((pattern) => pattern.test(trimmed)).length;
  if (codeSignals >= 2) return "code";

  return "text";
}

function compactJson(content: string): string | null {
  try {
    return JSON.stringify(JSON.parse(content));
  } catch {
    return null;
  }
}

function stripAnsi(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function collapseAdjacentDuplicates(lines: string[]): string[] {
  const result: string[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    let end = index + 1;
    while (end < lines.length && lines[end] === line) end += 1;
    const count = end - index;
    result.push(line);
    if (count > 1) result.push(`[previous line repeated ${count - 1} more time${count === 2 ? "" : "s"}]`);
    index = end;
  }
  return result;
}

function compactLog(content: string): string {
  const normalized = stripAnsi(content)
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ""));
  return collapseAdjacentDuplicates(normalized).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function compactSearch(content: string): string {
  const lines = content.split(/\r?\n/).map((line) => line.replace(/[ \t]+$/g, ""));
  return collapseAdjacentDuplicates(lines).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function compactText(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function compactCode(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .filter((line, index, all) => !(line === "" && index > 0 && all[index - 1] === ""))
    .join("\n")
    .trim();
}

function transformFor(kind: LiveContextKind, content: string): { content: string; transform: string } | null {
  switch (kind) {
    case "json": {
      const compacted = compactJson(content);
      return compacted === null ? null : { content: compacted, transform: "json_minify" };
    }
    case "log":
      return { content: compactLog(content), transform: "log_dedupe" };
    case "search":
      return { content: compactSearch(content), transform: "search_dedupe" };
    case "text":
      return { content: compactText(content), transform: "text_whitespace" };
    case "code":
      return { content: compactCode(content), transform: "code_whitespace" };
    case "unknown":
      return null;
  }
}

/**
 * Cache-preserving live-zone transform plane inspired by the behavior class of
 * local context optimizers, implemented independently for Token Intelligence.
 *
 * Invariants:
 * - stable-prefix blocks are byte-faithful and never enter the recovery store;
 * - code transformation is opt-in;
 * - every transformed block is recoverable from a caller-owned local store;
 * - token counts here are estimates only; measured savings remain the job of
 *   the repository's full-session evidence evaluator.
 */
export function transformLiveContextBlock(
  block: LiveContextBlock,
  recoveryStore: LocalContextRecoveryStore,
  options: LiveContextTransformOptions = {},
): LiveContextTransformReceipt {
  const before = estimateContextTokens(block.content);
  const detectedKind = block.kind && block.kind !== "unknown"
    ? block.kind
    : detectLiveContextKind(block.content);

  if (block.zone === "stable_prefix") {
    return {
      blockId: block.id,
      zone: block.zone,
      detectedKind,
      status: "protected_cache_prefix",
      content: block.content,
      estimatedTokensBefore: before,
      estimatedTokensAfter: before,
      estimatedTokensSaved: 0,
      estimateOnly: true,
      cachePrefixPreserved: true,
      recoverable: false,
      recoveryRef: null,
      transform: null,
    };
  }

  if (detectedKind === "code" && options.allowCode !== true) {
    return {
      blockId: block.id,
      zone: block.zone,
      detectedKind,
      status: "code_opt_in_required",
      content: block.content,
      estimatedTokensBefore: before,
      estimatedTokensAfter: before,
      estimatedTokensSaved: 0,
      estimateOnly: true,
      cachePrefixPreserved: true,
      recoverable: false,
      recoveryRef: null,
      transform: null,
    };
  }

  const transformed = transformFor(detectedKind, block.content);
  if (!transformed || transformed.content === block.content) {
    return {
      blockId: block.id,
      zone: block.zone,
      detectedKind,
      status: "no_safe_transform",
      content: block.content,
      estimatedTokensBefore: before,
      estimatedTokensAfter: before,
      estimatedTokensSaved: 0,
      estimateOnly: true,
      cachePrefixPreserved: true,
      recoverable: false,
      recoveryRef: null,
      transform: null,
    };
  }

  const after = estimateContextTokens(transformed.content);
  const saved = before - after;
  const threshold = Math.max(0, Math.trunc(options.minimumEstimatedSavingsTokens ?? 1));
  if (saved < threshold || saved <= 0) {
    return {
      blockId: block.id,
      zone: block.zone,
      detectedKind,
      status: "insufficient_savings",
      content: block.content,
      estimatedTokensBefore: before,
      estimatedTokensAfter: before,
      estimatedTokensSaved: 0,
      estimateOnly: true,
      cachePrefixPreserved: true,
      recoverable: false,
      recoveryRef: null,
      transform: null,
    };
  }

  const recoveryRef = recoveryStore.put(block.content);
  return {
    blockId: block.id,
    zone: block.zone,
    detectedKind,
    status: "transformed",
    content: transformed.content,
    estimatedTokensBefore: before,
    estimatedTokensAfter: after,
    estimatedTokensSaved: saved,
    estimateOnly: true,
    cachePrefixPreserved: true,
    recoverable: true,
    recoveryRef,
    transform: transformed.transform,
  };
}

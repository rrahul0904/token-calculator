/**
 * Independent, read-only, deterministic source-context selector.
 * Only pass pre-authorized non-sensitive files. Regex masking is not DLP.
 */
export interface ContextSourceFile { path: string; content: string }
export interface ContextPacketOptions {
  files: readonly ContextSourceFile[];
  query: string;
  maxCharacters?: number;
  maxFiles?: number;
  contextLines?: number;
  maxMatchesPerFile?: number;
}
export interface ContextPacketSection {
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  text: string;
}
export interface ContextPacket {
  contextText: string;
  sections: ContextPacketSection[];
  eligibleFileCount: number;
  skippedFiles: Array<{ path: string; reason: string }>;
  baselineCharacters: number;
  selectedCharacters: number;
  characterReductionPercent: number | null;
  truncation: boolean;
  recommendedStrategy: "selective_packet" | "full_authorized_read" | "no_relevant_matches";
  evidence: "deterministic_character_proxy";
  notes: string[];
}

const EXCLUDED_SEGMENTS = new Set(["node_modules", ".git", ".next", "dist", "build", "coverage", "vendor", ".env", ".cache"]);
const SENSITIVE_BASENAMES = /^(?:\.env(?:\..*)?|id_(?:rsa|ed25519)|credentials(?:\..*)?|secrets?(?:\..*)?)$/i;
const SENSITIVE_EXTENSIONS = /\.(?:pem|key|p12|pfx|jks|keystore|sqlite|db|map)$/i;
const MAX_SOURCE_CHARACTERS = 250_000;

function safePath(path: string): string | null {
  if (!path || path.includes("\0") || path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)) return null;
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) return null;
  if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment.toLowerCase()))) return null;
  const name = segments[segments.length - 1];
  if (SENSITIVE_BASENAMES.test(name) || SENSITIVE_EXTENSIONS.test(name)) return null;
  return normalized;
}
function checkedInteger(value: number | undefined, fallback: number, min: number, max: number, field: string): number {
  const result = value ?? fallback;
  if (!Number.isInteger(result) || result < min || result > max) throw new RangeError(field + " must be an integer between " + min + " and " + max);
  return result;
}
function redacted(line: string): string {
  if (/-----BEGIN (?:[A-Z ]* )?PRIVATE KEY-----/.test(line)) return "[PRIVATE KEY MATERIAL REDACTED]";
  return line.replace(/\b((?:api[_-]?key|access[_-]?token|auth[_-]?token|password|client[_-]?secret)\s*[:=]\s*)(?:["'`][^"'`]*["'`]|[^\s,;}]+)/gi, "$1[REDACTED]");
}
function termsFor(query: string): string[] {
  return [...new Set((query.toLowerCase().match(/[a-z0-9_]{2,}/g) ?? []))].slice(0, 16);
}
type Candidate = { path: string; lines: string[]; line: number; score: number };

/** No file IO, model API call or network. All returned line references are source lines. */
export function buildContextPacket(options: ContextPacketOptions): ContextPacket {
  const maxCharacters = checkedInteger(options.maxCharacters, 8000, 256, 128000, "maxCharacters");
  const maxFiles = checkedInteger(options.maxFiles, 8, 1, 64, "maxFiles");
  const contextLines = checkedInteger(options.contextLines, 3, 0, 20, "contextLines");
  const maxMatchesPerFile = checkedInteger(options.maxMatchesPerFile, 3, 1, 20, "maxMatchesPerFile");
  const terms = termsFor(options.query);
  if (!terms.length) throw new Error("query must contain a search term of at least two letters/digits");

  const skippedFiles: ContextPacket["skippedFiles"] = [];
  const accepted = new Map<string, string[]>();
  let baselineCharacters = 0;
  for (const file of options.files) {
    const path = safePath(file.path);
    if (!path) { skippedFiles.push({ path: file.path, reason: "excluded_or_unsafe_path" }); continue; }
    if (typeof file.content === "string" && /-----BEGIN [^\n]*PRIVATE KEY-----/.test(file.content)) {
      skippedFiles.push({ path: file.path, reason: "private_key_block_detected" }); continue;
    }
    if (typeof file.content !== "string" || file.content.length > MAX_SOURCE_CHARACTERS) {
      skippedFiles.push({ path: file.path, reason: "invalid_or_oversize_source" }); continue;
    }
    if (accepted.has(path)) { skippedFiles.push({ path, reason: "duplicate_path" }); continue; }
    accepted.set(path, file.content.replace(/\r\n?/g, "\n").split("\n"));
    baselineCharacters += file.content.length;
  }

  const candidates: Candidate[] = [];
  for (const [path, lines] of accepted) {
    const pathScore = terms.reduce((n, term) => n + Number(path.toLowerCase().includes(term)), 0);
    const matches: Candidate[] = [];
    for (let i = 0; i < lines.length; i++) {
      const lower = lines[i].toLowerCase();
      const matched = terms.reduce((n, term) => n + Number(lower.includes(term)), 0);
      if (matched) matches.push({ path, lines, line: i, score: matched * 10 + pathScore * 2 + Number(matched === terms.length) * 5 });
    }
    matches.sort((a, b) => b.score - a.score || a.line - b.line);
    candidates.push(...matches.slice(0, maxMatchesPerFile));
  }
  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line);

  const selectedPaths = new Set<string>();
  const usedLines = new Map<string, Set<number>>();
  const sections: ContextPacketSection[] = [];
  const output: string[] = [];
  let selectedCharacters = 0;
  let truncation = false;
  for (const candidate of candidates) {
    if (!selectedPaths.has(candidate.path) && selectedPaths.size >= maxFiles) { truncation = true; continue; }
    const indices = usedLines.get(candidate.path) ?? new Set<number>();
    const start = Math.max(0, candidate.line - contextLines);
    const end = Math.min(candidate.lines.length - 1, candidate.line + contextLines);
    const newIndices = Array.from({ length: end - start + 1 }, (_, n) => start + n).filter((n) => !indices.has(n));
    if (!newIndices.length) continue;
    const snippet = newIndices.map((line) => (line + 1) + ": " + redacted(candidate.lines[line])).join("\n");
    const sectionText = "### " + candidate.path + " (selected lines " + newIndices.map((n) => n + 1).join(",") + ")\n" + snippet + "\n";
    if (selectedCharacters + sectionText.length > maxCharacters) { truncation = true; continue; }
    for (const n of newIndices) indices.add(n);
    usedLines.set(candidate.path, indices);
    selectedPaths.add(candidate.path);
    sections.push({ path: candidate.path, startLine: newIndices[0] + 1, endLine: newIndices[newIndices.length - 1] + 1, score: candidate.score, text: sectionText });
    output.push(sectionText);
    selectedCharacters += sectionText.length;
  }
  return {
    contextText: output.join(""), sections, eligibleFileCount: accepted.size, skippedFiles,
    baselineCharacters, selectedCharacters,
    characterReductionPercent: baselineCharacters > 0 ? Math.round((1 - selectedCharacters / baselineCharacters) * 10000) / 100 : null,
    truncation,
    recommendedStrategy: sections.length === 0 ? "no_relevant_matches" : selectedCharacters >= baselineCharacters ? "full_authorized_read" : "selective_packet",
    evidence: "deterministic_character_proxy",
    notes: [
      "Character reduction is NOT measured tokens, actual API savings, or task-quality proof.",
      "Only authorized non-sensitive files; regex masking is not a DLP control.",
      "Verify against the full source and run tests before applying generated edits.",
    ],
  };
}

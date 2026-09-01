const FORBIDDEN_CONTENT_KEYS = new Set([
  "prompt",
  "prompts",
  "messages",
  "message_content",
  "input_text",
  "output_text",
  "response_text",
  "completion_text",
  "source_code",
  "sourcecode",
  "code_content",
  "raw_output",
  "tool_output",
  "tool_result",
  "stdout",
  "stderr",
  "api_key",
  "apikey",
  "secret",
  "password",
  "authorization",
]);

export interface PrivacyViolation {
  path: string;
  key: string;
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function findContentRetentionViolations(value: unknown, path = "$", depth = 0): PrivacyViolation[] {
  if (depth > 10 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((entry, index) => findContentRetentionViolations(entry, `${path}[${index}]`, depth + 1));
  if (typeof value !== "object") return [];

  const violations: PrivacyViolation[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizeKey(key);
    if (FORBIDDEN_CONTENT_KEYS.has(normalized)) {
      violations.push({ path: `${path}.${key}`, key });
      continue;
    }
    violations.push(...findContentRetentionViolations(child, `${path}.${key}`, depth + 1));
  }
  return violations;
}

export function assertMetadataOnly(value: unknown): void {
  const violations = findContentRetentionViolations(value);
  if (violations.length > 0) {
    const error = new Error("CONTENT_RETENTION_DISABLED");
    (error as Error & { violations?: PrivacyViolation[] }).violations = violations;
    throw error;
  }
}

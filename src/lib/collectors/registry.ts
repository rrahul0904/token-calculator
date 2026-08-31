import type { CollectorAdapter, CollectorName } from "@/lib/collectors/types";
import { codexCollector } from "@/lib/collectors/codex";
import { claudeCollector } from "@/lib/collectors/claude";
import { cursorCollector } from "@/lib/collectors/cursor";
import { antigravityCollector } from "@/lib/collectors/antigravity";

export const COLLECTORS: Record<CollectorName, CollectorAdapter> = {
  codex: codexCollector,
  claude: claudeCollector,
  cursor: cursorCollector,
  antigravity: antigravityCollector,
};

export function getCollector(name: string): CollectorAdapter | null {
  return Object.prototype.hasOwnProperty.call(COLLECTORS, name)
    ? COLLECTORS[name as CollectorName]
    : null;
}

export async function collectorCapabilities() {
  return Promise.all(Object.values(COLLECTORS).map((collector) => collector.capability()));
}

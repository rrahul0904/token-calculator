#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";
import {
  evaluateChangeEffectiveness,
  formatChangeEffectivenessReport,
  type ChangeEffectivenessPolicy,
  type DailyOptimizationMetric,
  type OptimizationChangeWindow,
} from "@/lib/optimization/change-effectiveness";
import {
  appendChangeJournalEntry,
  buildChangeWindows,
  createChangeJournalEntry,
  DEFAULT_CHANGE_JOURNAL_PATH,
  readChangeJournal,
} from "@/lib/optimization/change-journal";

function argValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined;
}

function has(args: string[], name: string): boolean {
  return args.includes(name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function printJson(value: unknown) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function journalPath(args: string[]) {
  return resolve(argValue(args, "--journal") ?? DEFAULT_CHANGE_JOURNAL_PATH);
}

function help() {
  process.stdout.write(`Token Intelligence change-results\n\nCommands:\n  record --rule RULE --collector NAME [--project ID] [--at ISO] [--source manual|token_intelligence] [--journal PATH]\n  stop --change CHANGE_ID [--at ISO] [--journal PATH]\n  list [--journal PATH] [--json]\n  evaluate INPUT.json [--journal PATH] [--json]\n\nINPUT.json:\n  {\n    "changeId": "change_...",\n    "metrics": [ ...DailyOptimizationMetric ],\n    "policy": { ...optional policy overrides }\n  }\n\nOr provide an inline \"change\" object instead of changeId. Evaluation is local-only and observational: it never promotes a before/after delta to verified savings.\n`);
}

async function recordChange(args: string[]) {
  const ruleId = argValue(args, "--rule");
  const collector = argValue(args, "--collector");
  if (!ruleId || !collector) throw new Error("record requires --rule and --collector");
  const rawSource = argValue(args, "--source") ?? "manual";
  if (rawSource !== "manual" && rawSource !== "token_intelligence") throw new Error("--source must be manual or token_intelligence");
  const entry = createChangeJournalEntry({
    event: "applied",
    occurredAt: argValue(args, "--at") ?? new Date().toISOString(),
    ruleId,
    collector,
    projectId: argValue(args, "--project") ?? null,
    source: rawSource,
  });
  await appendChangeJournalEntry(entry, journalPath(args));
  printJson({ recorded: true, entry });
}

async function stopChange(args: string[]) {
  const changeId = argValue(args, "--change");
  if (!changeId) throw new Error("stop requires --change CHANGE_ID");
  const path = journalPath(args);
  const parsed = await readChangeJournal(path);
  const applied = parsed.entries.find((entry) => entry.changeId === changeId && entry.event === "applied");
  if (!applied) throw new Error(`No applied journal entry found for ${changeId}`);
  const entry = createChangeJournalEntry({
    event: "stopped",
    occurredAt: argValue(args, "--at") ?? new Date().toISOString(),
    ruleId: applied.ruleId,
    collector: applied.collector,
    projectId: applied.projectId,
    source: applied.source,
    changeId,
  });
  await appendChangeJournalEntry(entry, path);
  printJson({ recorded: true, entry, warnings: parsed.warnings });
}

async function listChanges(args: string[]) {
  const parsed = await readChangeJournal(journalPath(args));
  const windows = buildChangeWindows(parsed.entries);
  if (has(args, "--json")) {
    printJson({ changes: windows.changes, warnings: [...parsed.warnings, ...windows.warnings] });
    return;
  }
  const lines = ["Token Intelligence optimization changes"];
  for (const change of windows.changes) {
    lines.push(`- ${change.changeId}  ${change.ruleId}  ${change.collector}  applied=${change.appliedAt}  stopped=${change.stoppedAt ?? "active"}  project=${change.projectId ?? "all"}`);
  }
  const warnings = [...parsed.warnings, ...windows.warnings];
  if (warnings.length) lines.push("", "Warnings:", ...warnings.map((warning) => `- ${warning}`));
  process.stdout.write(`${lines.join("\n")}\n`);
}

interface EvaluateFile {
  changeId?: string;
  change?: OptimizationChangeWindow;
  metrics: DailyOptimizationMetric[];
  policy?: Partial<ChangeEffectivenessPolicy>;
  otherChanges?: OptimizationChangeWindow[];
}

function parseEvaluateFile(value: unknown): EvaluateFile {
  if (!isRecord(value) || !Array.isArray(value.metrics)) throw new Error("INPUT.json must contain a metrics array");
  if (typeof value.changeId !== "string" && !isRecord(value.change)) throw new Error("INPUT.json must contain changeId or change");
  return value as unknown as EvaluateFile;
}

async function evaluateFile(file: string, args: string[]) {
  const input = parseEvaluateFile(JSON.parse(await readFile(resolve(file), "utf8")));
  let change = input.change;
  let journalChanges: OptimizationChangeWindow[] = [];
  let journalWarnings: string[] = [];
  if (input.changeId || !change) {
    const parsed = await readChangeJournal(journalPath(args));
    const windows = buildChangeWindows(parsed.entries);
    journalChanges = windows.changes;
    journalWarnings = [...parsed.warnings, ...windows.warnings];
    change = journalChanges.find((item) => item.changeId === input.changeId);
    if (!change) throw new Error(`Change ${input.changeId ?? "unknown"} was not found in the local journal`);
  }
  const otherChanges = [...journalChanges, ...(input.otherChanges ?? [])].filter((item, index, array) =>
    array.findIndex((candidate) => candidate.changeId === item.changeId) === index);
  const report = evaluateChangeEffectiveness({ change, metrics: input.metrics, policy: input.policy, otherChanges });
  if (has(args, "--json")) printJson({ report, journalWarnings });
  else {
    process.stdout.write(formatChangeEffectivenessReport(report));
    if (journalWarnings.length) process.stdout.write(`\nJournal warnings:\n${journalWarnings.map((warning) => `- ${warning}`).join("\n")}\n`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  if (!command || ["help", "--help", "-h"].includes(command)) return help();
  if (command === "record") return recordChange(args.slice(1));
  if (command === "stop") return stopChange(args.slice(1));
  if (command === "list") return listChanges(args.slice(1));
  if (command === "evaluate" && args[1]) return evaluateFile(args[1], args.slice(2));
  throw new Error("Unknown or incomplete command. Use --help.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

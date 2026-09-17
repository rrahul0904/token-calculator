import * as z from "zod";
import { MAX_PLANNING_TOKENS } from "@/lib/economics/workload";

export const workloadScenarioSchema = z.object({
  mode: z.enum(["tokens2cost", "cost2tokens"]).default("tokens2cost"),
  modelId: z.string().min(1).max(180),
  endpointId: z.string().max(240).nullable().optional(),
  pinnedModelId: z.string().max(180).nullable().optional(),
  totalTokens: z.number().int().nonnegative().max(MAX_PLANNING_TOKENS),
  budgetUsd: z.number().nonnegative().max(1_000_000_000),
  inputPercent: z.number().min(0).max(100),
  cacheHitPercent: z.number().min(0).max(100),
  cacheableInputPercent: z.number().min(0).max(100),
  cacheWrite5mPercent: z.number().min(0).max(100).default(0),
  cacheWrite1hPercent: z.number().min(0).max(100).default(0),
  requestsPerMonth: z.number().int().nonnegative().max(1_000_000_000_000).default(1),
});

export const frontierCandidateSchema = z.object({
  id: z.string().min(1).max(180),
  label: z.string().min(1).max(240),
  costUsd: z.number().nonnegative().nullable(),
  qualityScore: z.number().nullable(),
  qualityEvidence: z.object({
    source: z.string().min(1).max(120),
    sourceUrl: z.string().url(),
    benchmark: z.string().min(1).max(180),
    observedAt: z.string().min(10).max(80),
  }).nullable().optional(),
});

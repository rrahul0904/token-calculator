import {
  orchestrationGatewayContextSchema,
  resolveOrchestrationRoute,
  type OrchestrationProfile,
  type OrchestrationRole,
  type OrchestrationTaskBundle,
} from "@/lib/orchestration/contracts";

export interface OrchestrationExecutionAssignment {
  providerConnectionId: string;
  model: string;
  orchestration: ReturnType<typeof orchestrationGatewayContextSchema.parse>;
}

export interface OrchestrationExecutionBackend<TInput = unknown, TOutput = unknown> {
  id: string;
  execute(args: {
    assignment: OrchestrationExecutionAssignment;
    task: OrchestrationTaskBundle;
    input: TInput;
  }): Promise<TOutput>;
}

export function buildOrchestrationExecutionAssignment(args: {
  orchestrationRunId: string;
  profile: OrchestrationProfile;
  task: OrchestrationTaskBundle;
  role: OrchestrationRole;
  correctionCycle?: number;
  experiment?: {
    id: string;
    variant: "baseline" | "candidate";
  };
}): OrchestrationExecutionAssignment {
  const resolution = resolveOrchestrationRoute({
    profile: args.profile,
    task: args.task,
    role: args.role,
    correctionCycle: args.correctionCycle,
  });

  const orchestration = orchestrationGatewayContextSchema.parse({
    orchestrationRunId: args.orchestrationRunId,
    taskId: args.task.taskId,
    role: resolution.role,
    correctionCycle: args.correctionCycle ?? 0,
    routeDecision: resolution.decision,
    expectedProviderConnectionId: resolution.route.providerConnectionId,
    expectedModel: resolution.route.model,
    requireExactRoute: resolution.requireExactRoute,
    evidenceRequired: true,
    experimentId: args.experiment?.id,
    experimentVariant: args.experiment?.variant,
  });

  return {
    providerConnectionId: resolution.route.providerConnectionId,
    model: resolution.route.model,
    orchestration,
  };
}

export async function executeWithOrchestrationBackend<TInput, TOutput>(args: {
  backend: OrchestrationExecutionBackend<TInput, TOutput>;
  assignment: OrchestrationExecutionAssignment;
  task: OrchestrationTaskBundle;
  input: TInput;
}) {
  return args.backend.execute({
    assignment: args.assignment,
    task: args.task,
    input: args.input,
  });
}

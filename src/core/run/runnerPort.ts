import type { Plan, Project, Task } from "../../domain/index.js";

export interface RunnerPromptDraft {
  content: string;
}

export type RunnerDispatchState = "accepted" | "completed";

export interface RunnerDispatchContext {
  artifactsDir: string;
  logsDir: string;
  projectRoot: string;
  promptsDir: string;
  workspaceDir: string;
}

export interface RunnerDispatchInput {
  plan: Plan;
  project: Project;
  task: Task;
}

export interface RunnerDispatchResult {
  externalRunId?: string;
  message: string;
  promptDraft?: RunnerPromptDraft;
  runnerName: string;
  state: RunnerDispatchState;
}

export interface ExternalRunnerPort {
  dispatch(input: RunnerDispatchInput, context: RunnerDispatchContext): Promise<RunnerDispatchResult>;
}

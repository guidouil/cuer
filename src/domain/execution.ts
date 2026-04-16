import type { JsonObject } from "./event.js";
import type { PlanStatus } from "./plan.js";
import type { TaskStatus } from "./task.js";

export type ExecutionResultSource = "manual-cli";

export interface TaskExecutionResultArtifact {
  schemaVersion: 1;
  artifactId: string;
  artifactType: "task-execution-result";
  createdAt: string;
  nextStatus: TaskStatus;
  planId: string;
  previousStatus: TaskStatus;
  projectId: string;
  reason: string;
  source: ExecutionResultSource;
  summary: string;
  taskId: string;
  taskTitle: string;
}

export interface TaskExecutionReportedEventPayload extends JsonObject {
  artifactId: string;
  artifactPath: string;
  nextStatus: TaskStatus;
  previousStatus: TaskStatus;
  reason: string;
  source: ExecutionResultSource;
  summary: string;
}

export interface TaskRunDispatchedEventPayload extends JsonObject {
  externalRunId: string | null;
  planStatus: PlanStatus;
  promptPath: string | null;
  runner: string;
  state: "accepted" | "completed";
}

import type { TaskDetails } from "./planning.js";

export const TASK_STATUSES = ["draft", "ready", "blocked", "running", "done", "failed"] as const;
export const TASK_TYPES = [
  "clarification",
  "analysis",
  "implementation",
  "test",
  "documentation",
  "deployment",
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskType = (typeof TASK_TYPES)[number];

export interface Task {
  id: string;
  projectId: string;
  planId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  type: TaskType;
  acceptanceCriteria: string[];
  details: TaskDetails | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDependency {
  id: string;
  taskId: string;
  dependsOnTaskId: string;
  createdAt: string;
}

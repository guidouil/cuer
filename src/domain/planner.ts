import type { TaskType } from "./task.js";

export interface PlannerInput {
  projectName: string;
  goal: string;
}

export interface PlannedTaskDraft {
  title: string;
  description: string;
  priority: number;
  type: TaskType;
  acceptanceCriteria: string[];
}

export interface PlannedTaskDependencyDraft {
  taskIndex: number;
  dependsOnTaskIndex: number;
}

export interface PlanDraft {
  planner: string;
  summary: string;
  tasks: PlannedTaskDraft[];
  dependencies: PlannedTaskDependencyDraft[];
}

export interface PlannerPort {
  createPlan(input: PlannerInput): PlanDraft;
}

import type { TaskType } from "./task.js";
import type {
  PlanDetails,
  PlanQualityChecks,
  PlannerQuestion,
  ProjectSearchHints,
  TaskDetails,
  TaskSearchHints,
} from "./planning.js";

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
  details: TaskDetails;
}

export interface PlannedTaskDependencyDraft {
  taskIndex: number;
  dependsOnTaskIndex: number;
}

export interface PlanDraft {
  planner: string;
  summary: string;
  details: PlanDetails;
  tasks: PlannedTaskDraft[];
  dependencies: PlannedTaskDependencyDraft[];
}

export interface PlannerPort {
  createPlan(input: PlannerInput): PlanDraft;
}

export type PlannerResponseMode = "ask_user" | "create_plan";

export type PlannerResponseTaskType =
  | "clarification"
  | "analysis"
  | "implementation"
  | "test"
  | "documentation"
  | "deployment";

export interface PlannerTaskResponse {
  id: string;
  projectId: string;
  title: string;
  type: PlannerResponseTaskType;
  goal: string;
  input: string;
  action: string;
  output: string;
  validation: string;
  dependsOn: string[];
  taskSearch: TaskSearchHints;
}

export interface AskUserPlannerResponse {
  projectId: string;
  mode: "ask_user";
  summary: string;
  blockingUnknowns: string[];
  questions: PlannerQuestion[];
  projectSearch: ProjectSearchHints;
}

export interface CreatePlanPlannerResponse {
  projectId: string;
  mode: "create_plan";
  summary: string;
  assumptions: string[];
  unknowns: string[];
  projectSearch: ProjectSearchHints;
  tasks: PlannerTaskResponse[];
  qualityChecks: PlanQualityChecks;
}

export type ExternalPlannerResponse = AskUserPlannerResponse | CreatePlanPlannerResponse;

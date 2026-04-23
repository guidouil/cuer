import type { TaskType } from "./task.js";
import type {
  PlanDetails,
  PlanQualityChecks,
  PlannerAnswer,
  PlannerInquiry,
  PlannerQuestion,
  ProjectSearchHints,
  TaskDetails,
  TaskSearchHints,
} from "./planning.js";

export interface PlannerInput {
  clarificationAnswers: PlannerAnswer[];
  projectId: string;
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

export interface PlannerInquiryDecision {
  inquiry: PlannerInquiry;
  kind: "questions";
}

export interface PlannerPlanDecision {
  draft: PlanDraft;
  goal: string;
  kind: "plan";
}

export type PlannerDecision = PlannerInquiryDecision | PlannerPlanDecision;

export interface PlannerPort {
  readonly name: string;
  createPlan(input: PlannerInput): PlannerDecision;
}

export const PLANNER_SOURCES = ["account", "external-json", "simple"] as const;

export type PlannerSource = (typeof PLANNER_SOURCES)[number];

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

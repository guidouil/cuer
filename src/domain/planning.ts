import type { JsonObject } from "./event.js";

export interface ProjectSearchHints extends JsonObject {
  keywords: string[];
  domains: string[];
  intent: string;
  stackCandidates: string[];
  constraints: string[];
}

export interface TaskSearchHints extends JsonObject {
  keywords: string[];
  domains: string[];
  intent: string;
}

export interface PlanQualityChecks extends JsonObject {
  allAtomic: boolean;
  allTestable: boolean;
  dependenciesExplicit: boolean;
  noVagueTasks: boolean;
}

export interface PlanDetails extends JsonObject {
  assumptions: string[];
  projectSearch: ProjectSearchHints;
  qualityChecks: PlanQualityChecks;
  sourceProjectId: string;
  unknowns: string[];
}

export interface TaskDetails extends JsonObject {
  action: string;
  goal: string;
  input: string;
  output: string;
  plannerTaskId: string;
  taskSearch: TaskSearchHints;
  validation: string;
}

export interface PlannerQuestion extends JsonObject {
  id: string;
  question: string;
  why: string;
}

export interface PlannerInquiry extends JsonObject {
  blockingUnknowns: string[];
  projectSearch: ProjectSearchHints;
  questions: PlannerQuestion[];
  sourceProjectId: string;
  summary: string;
}

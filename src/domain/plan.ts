import type { PlanDetails } from "./planning.js";

export const PLAN_STATUSES = ["draft", "ready", "running", "done", "failed"] as const;

export type PlanStatus = (typeof PLAN_STATUSES)[number];

export interface Plan {
  id: string;
  projectId: string;
  goal: string;
  summary: string;
  status: PlanStatus;
  planner: string;
  details: PlanDetails | null;
  createdAt: string;
  updatedAt: string;
}

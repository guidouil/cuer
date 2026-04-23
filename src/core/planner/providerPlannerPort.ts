import type { PlannerAnswer } from "../../domain/index.js";

export interface ProviderPlannerRequest {
  clarificationAnswers: PlannerAnswer[];
  goal: string;
  projectId: string;
  projectName: string;
  rootPath: string;
}

export interface ProviderPlannerPort {
  readonly name: string;
  createResponse(input: ProviderPlannerRequest): Promise<string>;
}

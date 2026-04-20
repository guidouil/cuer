import { WorkspaceAppService } from "../../core/app/workspaceAppService.js";
import { readOptionValue, readPositionalArgs } from "../arguments.js";
import {
  canPromptForClarifications,
  collectClarificationAnswers,
  readPlannerResponse,
  renderPlannerInquiry,
} from "./plannerCliSupport.js";

import type { PlannerAnswer } from "../../domain/index.js";
import type { Terminal } from "../terminal.js";

const PLAN_OPTIONS_WITH_VALUES = [
  "--goal",
  "-g",
  "--planner-response",
  "--planner-json",
  "--planner",
  "--planner-name",
];

const workspaceAppService = new WorkspaceAppService();

export async function runPlanCommand(rootPath: string, args: string[], terminal: Terminal): Promise<void> {
  const goal = await resolveGoal(args, terminal);
  const plannerResponsePath = readOptionValue(args, ["--planner-response", "--planner-json"]);
  const plannerResponseJson = plannerResponsePath ? await readPlannerResponse(plannerResponsePath) : undefined;
  const plannerName = readOptionValue(args, ["--planner", "--planner-name"]) ?? undefined;
  let clarificationAnswers: PlannerAnswer[] = [];
  let attempts = 0;
  let result = workspaceAppService.runPlanner({
    goal,
    rootPath,
    ...(plannerName ? { plannerName } : {}),
    ...(plannerResponseJson ? { plannerResponseJson } : {}),
  });

  while (result.kind === "questions") {
    renderPlannerInquiry(result.planner, result.inquiry, terminal);

    if (plannerResponseJson || !canPromptForClarifications()) {
      return;
    }

    if (attempts >= 2) {
      terminal.info("");
      terminal.info("Planner still needs clarification after two follow-up rounds.");
      return;
    }

    terminal.info("");
    terminal.info("Answer the questions below to continue planning.");
    const answers = await collectClarificationAnswers(result.inquiry, terminal);
    if (!answers) {
      terminal.info("Planning stopped before all clarification answers were provided.");
      return;
    }

    clarificationAnswers = answers;
    attempts += 1;
    result = workspaceAppService.runPlanner({
      clarificationAnswers,
      goal,
      rootPath,
      ...(plannerName ? { plannerName } : {}),
    });
  }

  const currentProject = result.workspace.currentProject;
  const readyCount = currentProject?.queue.readyTaskIds.length ?? 0;
  const blockedCount = currentProject?.queue.blockedTaskIds.length ?? 0;

  terminal.info(`Plan created: ${result.plan.id}`);
  terminal.info(`Goal: ${result.plan.goal}`);
  terminal.info(`Planner: ${result.planner}`);
  terminal.info(`Tasks: ${result.tasks.length} total, ${readyCount} ready, ${blockedCount} blocked`);
}

async function resolveGoal(args: string[], terminal: Terminal): Promise<string> {
  const flagGoal = readOptionValue(args, ["--goal", "-g"]);
  if (flagGoal) {
    return flagGoal;
  }

  const positionalGoal = readPositionalArgs(args, PLAN_OPTIONS_WITH_VALUES).join(" ").trim();
  if (positionalGoal.length > 0) {
    return positionalGoal;
  }

  const promptedGoal = await terminal.prompt("Objective: ");
  const resolvedGoal = promptedGoal.trim();
  if (resolvedGoal.length === 0) {
    throw new Error("A development objective is required.");
  }

  return resolvedGoal;
}

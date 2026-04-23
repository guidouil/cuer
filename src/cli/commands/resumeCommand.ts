import { WorkspaceAppService } from "../../core/app/workspaceAppService.js";
import { readOptionValue } from "../arguments.js";
import {
  canPromptForClarifications,
  collectClarificationAnswers,
  mergePlannerAnswers,
  readPlannerAnswers,
  readPlannerResponse,
  renderPlannerInquiry,
} from "./plannerCliSupport.js";

import type { PlannerAnswer, PlannerInquiry } from "../../domain/index.js";
import type { Terminal } from "../terminal.js";

const workspaceAppService = new WorkspaceAppService();

export async function runResumeCommand(rootPath: string, args: string[], terminal: Terminal): Promise<void> {
  const pendingInquiry = workspaceAppService.getPendingPlannerInquiry(rootPath);
  if (!pendingInquiry) {
    terminal.info('No pending planner inquiry found. Run "cuer plan" to start a new planning round.');
    return;
  }

  renderPlannerInquiry(pendingInquiry.planner, pendingInquiry.inquiry, terminal);
  terminal.info(`Goal: ${pendingInquiry.goal}`);

  const plannerResponsePath = readOptionValue(args, ["--planner-response", "--planner-json"]);
  const plannerResponseJson = plannerResponsePath ? await readPlannerResponse(plannerResponsePath) : undefined;
  const plannerName = readOptionValue(args, ["--planner", "--planner-name"]) ?? pendingInquiry.planner;

  if (requiresImportedPlannerResponse(pendingInquiry.plannerSource) && !plannerResponseJson) {
    terminal.info("");
    terminal.info("This inquiry came from an external planner.");
    terminal.info('Resume it with a fresh planner JSON response: `cuer resume --planner-response <file> --planner <name>`');
    return;
  }

  let clarificationAnswers = await resolveClarificationAnswers(args, pendingInquiry.inquiry, terminal);
  if (!clarificationAnswers) {
    return;
  }

  let result = await workspaceAppService.runPlanner({
    clarificationAnswers,
    goal: pendingInquiry.goal,
    rootPath,
    ...(plannerResponseJson ? { plannerResponseJson } : {}),
    ...(plannerName ? { plannerName } : {}),
  });

  while (result.kind === "questions" && !plannerResponseJson && canPromptForClarifications()) {
    terminal.info("");
    terminal.info("Planner still needs clarification before creating a plan.");
    renderPlannerInquiry(result.planner, result.inquiry, terminal);
    terminal.info("");
    terminal.info("Answer the new questions below to continue planning.");

    const nextAnswers = await collectClarificationAnswers(result.inquiry, terminal);
    if (!nextAnswers) {
      terminal.info("Planning stopped before all clarification answers were provided.");
      return;
    }

    clarificationAnswers = mergePlannerAnswers(clarificationAnswers, nextAnswers);
    result = await workspaceAppService.runPlanner({
      clarificationAnswers,
      goal: pendingInquiry.goal,
      rootPath,
    });
  }

  if (result.kind === "questions") {
    terminal.info("");
    terminal.info('Planner still needs clarification. Run "cuer resume" again after answering the new questions.');
    return;
  }

  const currentProject = result.workspace.currentProject;
  const readyCount = currentProject?.queue.readyTaskIds.length ?? 0;
  const blockedCount = currentProject?.queue.blockedTaskIds.length ?? 0;

  terminal.info("");
  terminal.info(`Plan created: ${result.plan.id}`);
  terminal.info(`Goal: ${result.plan.goal}`);
  terminal.info(`Planner: ${result.planner}`);
  terminal.info(`Tasks: ${result.tasks.length} total, ${readyCount} ready, ${blockedCount} blocked`);
}

async function resolveClarificationAnswers(
  args: string[],
  inquiry: PlannerInquiry,
  terminal: Terminal,
): Promise<PlannerAnswer[] | null> {
  const answersFile = readOptionValue(args, ["--answers-file"]);
  if (answersFile) {
    return readPlannerAnswers(answersFile, inquiry);
  }

  if (!canPromptForClarifications()) {
    terminal.info("");
    terminal.info('Provide `--answers-file <file>` or rerun `cuer resume` in an interactive terminal.');
    return null;
  }

  terminal.info("");
  terminal.info("Answer the questions below to continue planning.");
  return collectClarificationAnswers(inquiry, terminal);
}

function requiresImportedPlannerResponse(plannerSource: "account" | "external-json" | "simple"): boolean {
  return plannerSource === "external-json";
}

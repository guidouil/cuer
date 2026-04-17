import { text as readStreamText } from "node:stream/consumers";

import { getProjectStatus } from "../../core/context/projectStatus.js";
import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { createPlanDraftFromPlannerResponse, createPlannerInquiry, parseExternalPlannerResponse } from "../../core/planner/plannerJson.js";
import { PlanningService } from "../../core/planner/planningService.js";
import { SimplePlanner } from "../../core/planner/simplePlanner.js";
import { readTextFile } from "../../filesystem/workspace.js";
import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";
import { readOptionValue, readPositionalArgs } from "../arguments.js";

import type { AskUserPlannerResponse, Project } from "../../domain/index.js";
import type { Terminal } from "../terminal.js";

const PLAN_OPTIONS_WITH_VALUES = [
  "--goal",
  "-g",
  "--planner-response",
  "--planner-json",
  "--planner",
  "--planner-name",
];

export async function runPlanCommand(rootPath: string, args: string[], terminal: Terminal): Promise<void> {
  const goal = await resolveGoal(args, terminal);
  const context = WorkspaceContext.open(rootPath, { autoInitialize: true });

  try {
    const { created, project } = context.ensureProject();

    if (created) {
      context.repositories.events.create({
        id: createId("event"),
        projectId: project.id,
        planId: null,
        taskId: null,
        type: "project.registered",
        payload: {
          rootPath: project.rootPath,
        },
        createdAt: nowIso(),
      });
    }

    const plannerResponsePath = readOptionValue(args, ["--planner-response", "--planner-json"]);
    if (plannerResponsePath) {
      await applyExternalPlannerResponse(context, project, goal, plannerResponsePath, args, terminal);
      return;
    }

    const planningService = new PlanningService(new SimplePlanner());
    const result = planningService.createInitialPlan(context, project, goal);
    const status = getProjectStatus(context, project);

    terminal.info(`Plan created: ${result.plan.id}`);
    terminal.info(`Goal: ${result.plan.goal}`);
    terminal.info(`Tasks: ${result.tasks.length} total, ${status.queue.readyTaskIds.length} ready, ${status.queue.blockedTaskIds.length} blocked`);
  } finally {
    context.close();
  }
}

async function applyExternalPlannerResponse(
  context: WorkspaceContext,
  project: Project,
  goal: string,
  plannerResponsePath: string,
  args: string[],
  terminal: Terminal,
): Promise<void> {
  const rawResponse = await readPlannerResponse(plannerResponsePath);
  const plannerResponse = parseExternalPlannerResponse(rawResponse);
  const plannerName = readOptionValue(args, ["--planner", "--planner-name"]) ?? "external-json-v1";

  if (plannerResponse.mode === "ask_user") {
    renderPlannerInquiry(context, project.id, plannerName, plannerResponse, terminal);
    return;
  }

  const planningService = new PlanningService();
  const draft = createPlanDraftFromPlannerResponse(plannerResponse, plannerName);
  const result = planningService.createPlanFromDraft(context, project, goal, draft);
  const status = getProjectStatus(context, project);

  terminal.info(`Plan created: ${result.plan.id}`);
  terminal.info(`Goal: ${result.plan.goal}`);
  terminal.info(`Planner: ${result.plan.planner}`);
  terminal.info(`Tasks: ${result.tasks.length} total, ${status.queue.readyTaskIds.length} ready, ${status.queue.blockedTaskIds.length} blocked`);
}

function renderPlannerInquiry(
  context: WorkspaceContext,
  projectId: string,
  plannerName: string,
  response: AskUserPlannerResponse,
  terminal: Terminal,
): void {
  const inquiry = createPlannerInquiry(response);
  const timestamp = nowIso();

  context.repositories.events.create({
    id: createId("event"),
    projectId,
    planId: null,
    taskId: null,
    type: "planner.questions.generated",
    payload: {
      blockingUnknowns: inquiry.blockingUnknowns,
      planner: plannerName,
      projectSearch: inquiry.projectSearch,
      questions: inquiry.questions,
      sourceProjectId: inquiry.sourceProjectId,
      summary: inquiry.summary,
    },
    createdAt: timestamp,
  });

  terminal.info("Planner needs clarification before creating a plan.");
  terminal.info(`Planner: ${plannerName}`);
  terminal.info(`Summary: ${inquiry.summary}`);
  terminal.info(`Planner project id: ${inquiry.sourceProjectId}`);
  terminal.info("");
  terminal.info("Blocking unknowns:");
  if (inquiry.blockingUnknowns.length === 0) {
    terminal.info("  - none");
  } else {
    for (const blocker of inquiry.blockingUnknowns) {
      terminal.info(`  - ${blocker}`);
    }
  }

  terminal.info("");
  terminal.info("Questions:");
  for (const question of inquiry.questions) {
    terminal.info(`  - [${question.id}] ${question.question}`);
    terminal.info(`    Why: ${question.why}`);
  }
}

async function readPlannerResponse(filePath: string): Promise<string> {
  if (filePath === "-") {
    return (await readStreamText(process.stdin)).trim();
  }

  return readTextFile(filePath);
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

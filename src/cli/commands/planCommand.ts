import { text as readStreamText } from "node:stream/consumers";

import { WorkspaceAppService } from "../../core/app/workspaceAppService.js";
import { readTextFile } from "../../filesystem/workspace.js";
import { readOptionValue, readPositionalArgs } from "../arguments.js";

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
  const result = workspaceAppService.runPlanner({
    goal,
    rootPath,
    ...(plannerName ? { plannerName } : {}),
    ...(plannerResponseJson ? { plannerResponseJson } : {}),
  });

  if (result.kind === "questions") {
    terminal.info("Planner needs clarification before creating a plan.");
    terminal.info(`Planner: ${result.planner}`);
    terminal.info(`Summary: ${result.inquiry.summary}`);
    terminal.info(`Planner project id: ${result.inquiry.sourceProjectId}`);
    terminal.info("");
    terminal.info("Blocking unknowns:");
    if (result.inquiry.blockingUnknowns.length === 0) {
      terminal.info("  - none");
    } else {
      for (const blocker of result.inquiry.blockingUnknowns) {
        terminal.info(`  - ${blocker}`);
      }
    }

    terminal.info("");
    terminal.info("Questions:");
    for (const question of result.inquiry.questions) {
      terminal.info(`  - [${question.id}] ${question.question}`);
      terminal.info(`    Why: ${question.why}`);
    }

    return;
  }

  const currentProject = result.workspace.currentProject;
  const readyCount = currentProject?.queue.readyTaskIds.length ?? 0;
  const blockedCount = currentProject?.queue.blockedTaskIds.length ?? 0;

  terminal.info(`Plan created: ${result.plan.id}`);
  terminal.info(`Goal: ${result.plan.goal}`);
  terminal.info(`Planner: ${result.planner}`);
  terminal.info(`Tasks: ${result.tasks.length} total, ${readyCount} ready, ${blockedCount} blocked`);
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

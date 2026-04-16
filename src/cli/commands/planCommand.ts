import { getProjectStatus } from "../../core/context/projectStatus.js";
import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { PlanningService } from "../../core/planner/planningService.js";
import { SimplePlanner } from "../../core/planner/simplePlanner.js";
import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";

import type { Terminal } from "../terminal.js";

export async function runPlanCommand(rootPath: string, goalParts: string[], terminal: Terminal): Promise<void> {
  const goal = await resolveGoal(goalParts, terminal);
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

async function resolveGoal(goalParts: string[], terminal: Terminal): Promise<string> {
  const flagIndex = goalParts.findIndex((part) => part === "--goal" || part === "-g");

  let goal = "";
  if (flagIndex >= 0) {
    goal = goalParts.slice(flagIndex + 1).join(" ");
  } else {
    goal = goalParts.join(" ");
  }

  if (goal.trim().length > 0) {
    return goal.trim();
  }

  const promptedGoal = await terminal.prompt("Objective: ");
  const resolvedGoal = promptedGoal.trim();
  if (resolvedGoal.length === 0) {
    throw new Error("A development objective is required.");
  }

  return resolvedGoal;
}

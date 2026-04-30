import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { PlanInspectionService, type PlanInspectionSnapshot } from "../../core/context/planInspectionService.js";
import { renderPlanTaskRows, renderTable, shortIdentifier } from "../format.js";

import type { Terminal } from "../terminal.js";

export function runShowPlanCommand(rootPath: string, terminal: Terminal): void {
  const context = WorkspaceContext.open(rootPath);

  try {
    const project = context.repositories.projects.findByRootPath(context.paths.rootPath);
    if (!project) {
      terminal.info('No project registered yet. Run "cuer init" or "cuer plan" first.');
      return;
    }

    const inspectionService = new PlanInspectionService();
    const snapshot = inspectionService.inspectLatestPlan(context, project);
    if (!snapshot) {
      terminal.info('No plan found yet. Run "cuer plan" to create the first task graph.');
      return;
    }

    renderPlanSnapshot(snapshot, terminal);
  } finally {
    context.close();
  }
}

function renderPlanSnapshot(snapshot: PlanInspectionSnapshot, terminal: Terminal): void {
  const tasksById = new Map(snapshot.tasks.map((entry) => [entry.task.id, entry.task]));
  const dependencyTitles = new Map<string, string[]>();

  for (const [taskId, dependencyIds] of snapshot.dependencyMap.entries()) {
    dependencyTitles.set(
      taskId,
      dependencyIds
        .map((dependencyId) => tasksById.get(dependencyId)?.title)
        .filter((title): title is string => title !== undefined),
    );
  }

  terminal.info(`Plan: ${snapshot.plan.id}`);
  terminal.info(`Status: ${snapshot.plan.status}`);
  terminal.info(`Goal: ${snapshot.plan.goal}`);
  terminal.info(`Planner: ${snapshot.plan.planner}`);
  if (snapshot.plan.details) {
    if (snapshot.plan.details.request.originalGoal !== snapshot.plan.goal) {
      terminal.info(`Original goal: ${snapshot.plan.details.request.originalGoal}`);
    }
    terminal.info(`Planner project id: ${snapshot.plan.details.sourceProjectId}`);
    terminal.info(`Planner intent: ${snapshot.plan.details.projectSearch.intent}`);
    terminal.info(`Clarifications: ${snapshot.plan.details.request.clarificationAnswers.length}`);
    terminal.info(`Assumptions: ${formatSummaryList(snapshot.plan.details.assumptions)}`);
    terminal.info(`Unknowns: ${formatSummaryList(snapshot.plan.details.unknowns)}`);
  }
  terminal.info(
    `Queue: ready ${snapshot.queue.readyTaskIds.length} | blocked ${snapshot.queue.blockedTaskIds.length} | running ${snapshot.queue.runningTaskIds.length} | done ${snapshot.queue.doneTaskIds.length} | failed ${snapshot.queue.failedTaskIds.length}`,
  );
  terminal.info("");
  terminal.info(
    renderTable(
      ["TASK", "STATUS", "P", "TYPE", "DEPENDS ON", "LATEST ARTIFACT", "TITLE"],
      renderPlanTaskRows(snapshot.tasks, dependencyTitles),
    ),
  );

  terminal.info("");
  terminal.info("Artifact references:");
  const entriesWithArtifacts = snapshot.tasks.filter((entry) => entry.latestArtifact !== null);
  if (entriesWithArtifacts.length === 0) {
    terminal.info("  - none");
    return;
  }

  for (const entry of entriesWithArtifacts) {
    const artifact = entry.latestArtifact;
    if (!artifact) {
      continue;
    }

    terminal.info(
      `  - ${shortIdentifier(entry.task.id)} -> ${shortIdentifier(artifact.artifactId)} (${artifact.previousStatus} -> ${artifact.nextStatus})`,
    );
    terminal.info(`    Summary: ${artifact.summary}`);
  }
}

function formatSummaryList(values: string[]): string {
  return values.length === 0 ? "none" : values.join("; ");
}

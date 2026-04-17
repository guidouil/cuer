import { getProjectStatus } from "../../core/context/projectStatus.js";
import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { renderEventLines, shortIdentifier } from "../format.js";

import type { Terminal } from "../terminal.js";

export function runStatusCommand(rootPath: string, terminal: Terminal): void {
  const context = WorkspaceContext.open(rootPath);

  try {
    const project = context.repositories.projects.findByRootPath(rootPath);
    if (!project) {
      terminal.info('No project registered yet. Run "cuer init" or "cuer plan" first.');
      return;
    }

    const status = getProjectStatus(context, project);

    terminal.info(`Project: ${project.name}`);
    terminal.info(`Root: ${project.rootPath}`);
    terminal.info(`Workspace: ${context.paths.workspaceDir}`);

    if (!status.plan) {
      terminal.info("Plan: none");
      return;
    }

    terminal.info(`Plan: ${shortIdentifier(status.plan.id)} (${status.plan.status})`);
    terminal.info(`Goal: ${status.plan.goal}`);
    terminal.info(`Planner: ${status.plan.planner}`);
    if (status.plan.details) {
      terminal.info(`Planner project id: ${status.plan.details.sourceProjectId}`);
    }
    terminal.info(
      `Tasks: ${status.tasks.length} total | ready ${status.queue.readyTaskIds.length} | blocked ${status.queue.blockedTaskIds.length} | running ${status.queue.runningTaskIds.length} | done ${status.queue.doneTaskIds.length} | failed ${status.queue.failedTaskIds.length}`,
    );
    terminal.info(
      `Validation: pending validation tasks ${status.review.pendingValidationTasks} | blocked tasks ${status.review.blockedTasks}`,
    );

    if (status.events.length > 0) {
      terminal.info("Recent events:");
      for (const line of renderEventLines(status.events.slice(0, 5))) {
        terminal.info(`  - ${line}`);
      }
    }
  } finally {
    context.close();
  }
}

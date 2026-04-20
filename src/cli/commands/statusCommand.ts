import { AccountManagerService } from "../../core/accounts/accountManagerService.js";
import { getProjectStatus } from "../../core/context/projectStatus.js";
import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { findPendingPlannerInquiry } from "../../core/planner/pendingPlannerInquiry.js";
import { renderEventLines, shortIdentifier } from "../format.js";

import type { Terminal } from "../terminal.js";

export function runStatusCommand(rootPath: string, terminal: Terminal): void {
  const context = WorkspaceContext.open(rootPath);
  const accountManager = new AccountManagerService();

  try {
    const accountSnapshot = accountManager.getSnapshot(context);

    terminal.info(`Workspace: ${context.paths.workspaceDir}`);
    terminal.info(`Accounts: ${accountSnapshot.accounts.length}`);
    if (accountSnapshot.projectWorkGateway.isReady) {
      terminal.info(
        `Project gateway: ${accountSnapshot.projectWorkGateway.accountName} (${accountSnapshot.projectWorkGateway.providerLabel})`,
      );
    } else if (accountSnapshot.projectWorkGateway.reason) {
      terminal.info(`Project gateway: ${accountSnapshot.projectWorkGateway.reason}`);
    }

    const project = context.repositories.projects.findByRootPath(rootPath);
    if (!project) {
      terminal.info('Project: none yet. Add an account and run "cuer plan" to create the first project flow.');
      return;
    }

    const status = getProjectStatus(context, project);

    terminal.info(`Project: ${project.name}`);
    terminal.info(`Root: ${project.rootPath}`);

    const pendingPlannerInquiry = findPendingPlannerInquiry(context.repositories.events.listRecentByProjectId(project.id, 50));
    if (pendingPlannerInquiry) {
      terminal.info(
        `Pending planner inquiry: ${pendingPlannerInquiry.inquiry.questions.length} question(s) from ${pendingPlannerInquiry.planner}`,
      );
    }

    if (!status.plan) {
      terminal.info("Plan: none");
      return;
    }

    terminal.info(`Plan: ${shortIdentifier(status.plan.id)} (${status.plan.status})`);
    terminal.info(`Goal: ${status.plan.goal}`);
    terminal.info(`Planner: ${status.plan.planner}`);
    if (status.plan.details) {
      if (status.plan.details.request.originalGoal !== status.plan.goal) {
        terminal.info(`Original goal: ${status.plan.details.request.originalGoal}`);
      }
      terminal.info(`Planner project id: ${status.plan.details.sourceProjectId}`);
      terminal.info(`Clarifications: ${status.plan.details.request.clarificationAnswers.length}`);
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

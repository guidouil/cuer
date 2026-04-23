import { WorkspaceAppService } from "../../core/app/workspaceAppService.js";

import type { Terminal } from "../terminal.js";

const workspaceAppService = new WorkspaceAppService();

export function runResetCommand(rootPath: string, terminal: Terminal): void {
  const result = workspaceAppService.resetProjectWorkflow(rootPath);

  if (!result.projectFound) {
    terminal.info('No project registered yet. Run "cuer plan" to create a workflow first.');
    return;
  }

  const removedStateCount = result.removedPlanCount + result.removedTaskCount + result.removedEventCount;
  const removedFileCount =
    result.removedPlanSnapshotCount + result.removedPromptCount + result.removedExecutionArtifactCount;

  if (removedStateCount === 0 && removedFileCount === 0) {
    terminal.info("Nothing to reset. No plans, tasks, or generated workflow files were found.");
    return;
  }

  terminal.info(
    `Reset complete: ${result.removedPlanCount} plan(s), ${result.removedTaskCount} task(s), ${result.removedEventCount} event(s) removed.`,
  );
  terminal.info(
    `Files cleared: ${result.removedPlanSnapshotCount} plan snapshot(s), ${result.removedPromptCount} prompt(s), ${result.removedExecutionArtifactCount} execution artifact(s).`,
  );
}

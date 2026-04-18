import { getProjectStatus } from "../../core/context/projectStatus.js";
import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { RunService } from "../../core/run/runService.js";
import { ManualExternalRunner } from "../../integrations/runners/manualExternalRunner.js";
import { readOptionValue } from "../arguments.js";
import { shortIdentifier } from "../format.js";

import type { Terminal } from "../terminal.js";

export async function runRunCommand(rootPath: string, args: string[], terminal: Terminal): Promise<void> {
  const context = WorkspaceContext.open(rootPath);

  try {
    const project = context.repositories.projects.findByRootPath(rootPath);
    if (!project) {
      terminal.info('No project registered yet. Run "cuer init" or "cuer plan" first.');
      return;
    }

    const runService = new RunService(new ManualExternalRunner());
    const taskId = readTaskId(args);
    const result = await runService.runNextTask(context, project, {
      ...(taskId ? { taskId } : {}),
    });
    const status = getProjectStatus(context, project);

    terminal.info(`Account: ${result.gateway.accountName} (${result.gateway.providerLabel})`);
    terminal.info(`Runner: ${result.dispatch.runnerName}`);
    terminal.info(`Task: ${result.task.title}`);
    terminal.info(`Task status: ${result.task.status}`);
    terminal.info(`Plan: ${shortIdentifier(result.plan.id)} (${result.plan.status})`);

    if (result.promptPath) {
      terminal.info(`Prompt: ${result.promptPath}`);
    }

    if (result.synchronizedTasks.length > 0) {
      terminal.info(`Queue sync: ${result.synchronizedTasks.length} dependent task(s) updated`);
    }

    terminal.info(
      `Queue: ready ${status.queue.readyTaskIds.length} | blocked ${status.queue.blockedTaskIds.length} | running ${status.queue.runningTaskIds.length} | done ${status.queue.doneTaskIds.length}`,
    );
  } finally {
    context.close();
  }
}

function readTaskId(args: string[]): string | undefined {
  return readOptionValue(args, ["--task", "--task-id"]);
}

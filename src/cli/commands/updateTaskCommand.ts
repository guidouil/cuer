import { TASK_STATUSES, type TaskStatus } from "../../domain/index.js";
import { getProjectStatus } from "../../core/context/projectStatus.js";
import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { TaskUpdateService } from "../../core/queue/taskUpdateService.js";
import { readOptionValue } from "../arguments.js";
import { shortIdentifier } from "../format.js";

import type { Terminal } from "../terminal.js";

export function runUpdateTaskCommand(rootPath: string, args: string[], terminal: Terminal): void {
  const context = WorkspaceContext.open(rootPath);

  try {
    const project = context.repositories.projects.findByRootPath(rootPath);
    if (!project) {
      terminal.info('No project registered yet. Run "cuer init" or "cuer plan" first.');
      return;
    }

    const status = readStatus(args);
    const reason = readReason(args, status);
    const summary = readSummary(args);
    const taskId = readOptionValue(args, ["--task", "--task-id"]);

    const updateService = new TaskUpdateService();
    const result = updateService.updateTask(context, project, {
      reason,
      status,
      ...(summary ? { summary } : {}),
      ...(taskId ? { taskId } : {}),
    });
    const snapshot = getProjectStatus(context, project);

    terminal.info(`Task: ${result.task.title}`);
    terminal.info(`Task status: ${result.task.status}`);
    terminal.info(`Plan: ${shortIdentifier(result.plan.id)} (${result.plan.status})`);
    terminal.info(`Execution artifact: ${result.artifactPath}`);

    if (result.synchronizedTasks.length > 0) {
      terminal.info(`Queue sync: ${result.synchronizedTasks.length} dependent task(s) updated`);
    }

    terminal.info(
      `Queue: ready ${snapshot.queue.readyTaskIds.length} | blocked ${snapshot.queue.blockedTaskIds.length} | running ${snapshot.queue.runningTaskIds.length} | done ${snapshot.queue.doneTaskIds.length} | failed ${snapshot.queue.failedTaskIds.length}`,
    );
  } finally {
    context.close();
  }
}

function readStatus(args: string[]): TaskStatus {
  const rawStatus = readOptionValue(args, ["--status"]);
  if (!rawStatus) {
    throw new Error('Missing required option "--status <status>".');
  }

  if (!TASK_STATUSES.includes(rawStatus as TaskStatus)) {
    throw new Error(`Invalid task status "${rawStatus}". Expected one of: ${TASK_STATUSES.join(", ")}.`);
  }

  return rawStatus as TaskStatus;
}

function readReason(args: string[], status: TaskStatus): string {
  return readOptionValue(args, ["--reason"]) ?? `Manual task update to ${status} via cuer update-task.`;
}

function readSummary(args: string[]): string | undefined {
  return readOptionValue(args, ["--summary"]);
}

import { TaskHistoryService } from "../../core/history/taskHistoryService.js";
import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { readOptionValue } from "../arguments.js";
import { shortIdentifier } from "../format.js";

import type { TaskHistoryEntry } from "../../core/history/taskHistoryService.js";
import type { Terminal } from "../terminal.js";

export function runTaskHistoryCommand(rootPath: string, args: string[], terminal: Terminal): void {
  const context = WorkspaceContext.open(rootPath);

  try {
    const project = context.repositories.projects.findByRootPath(context.paths.rootPath);
    if (!project) {
      terminal.info('No project registered yet. Run "cuer init" or "cuer plan" first.');
      return;
    }

    const taskId = readOptionValue(args, ["--task", "--task-id"]);
    const limit = readLimit(args);
    const historyService = new TaskHistoryService();
    const entries = historyService.listHistory(context, project, {
      limit,
      ...(taskId ? { taskId } : {}),
    });

    if (entries.length === 0) {
      terminal.info("No execution history found.");
      return;
    }

    terminal.info(
      taskId
        ? `Execution history for task ${shortIdentifier(taskId)}`
        : `Execution history for project ${project.name}`,
    );

    for (const entry of entries) {
      renderHistoryEntry(entry, terminal);
    }
  } finally {
    context.close();
  }
}

function renderHistoryEntry(entry: TaskHistoryEntry, terminal: Terminal): void {
  terminal.info("");
  terminal.info(`${entry.createdAt}  ${entry.previousStatus} -> ${entry.nextStatus}  ${entry.taskTitle}`);
  terminal.info(`  Task: ${entry.taskId}`);
  terminal.info(`  Summary: ${entry.summary}`);
  terminal.info(`  Reason: ${entry.reason}`);
  terminal.info(`  Source: ${entry.source}`);
  terminal.info(`  Artifact: ${entry.artifactFound ? entry.artifactPath : `missing (${entry.artifactPath})`}`);
}

function readLimit(args: string[]): number {
  const rawLimit = readOptionValue(args, ["--limit"]);
  if (!rawLimit) {
    return 10;
  }

  const limit = Number.parseInt(rawLimit, 10);
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error(`Invalid limit "${rawLimit}". Expected a positive integer.`);
  }

  return limit;
}

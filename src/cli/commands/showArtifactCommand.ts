import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { TaskHistoryService } from "../../core/history/taskHistoryService.js";
import { readOptionValue } from "../arguments.js";
import { shortIdentifier } from "../format.js";

import type { TaskHistoryEntry } from "../../core/history/taskHistoryService.js";
import type { Terminal } from "../terminal.js";

export function runShowArtifactCommand(rootPath: string, args: string[], terminal: Terminal): void {
  const context = WorkspaceContext.open(rootPath);

  try {
    const project = context.repositories.projects.findByRootPath(rootPath);
    if (!project) {
      terminal.info('No project registered yet. Run "cuer init" or "cuer plan" first.');
      return;
    }

    const taskId = readOptionValue(args, ["--task", "--task-id"]);
    const artifactId = readOptionValue(args, ["--artifact", "--artifact-id"]);
    const selection = resolveSelection(taskId, artifactId);

    const historyService = new TaskHistoryService();
    const entry =
      selection.kind === "artifact"
        ? historyService.getArtifactById(context, project, selection.value)
        : historyService.getLatestArtifactForTask(context, project, selection.value);

    if (!entry) {
      terminal.info(
        selection.kind === "artifact"
          ? `No execution artifact found for ${shortIdentifier(selection.value)}.`
          : `No execution artifact found for task ${shortIdentifier(selection.value)}.`,
      );
      return;
    }

    renderArtifact(entry, terminal);
  } finally {
    context.close();
  }
}

function renderArtifact(entry: TaskHistoryEntry, terminal: Terminal): void {
  terminal.info("Execution artifact");
  terminal.info("");
  terminal.info(`Artifact id: ${entry.artifactId}`);
  terminal.info(`Created at: ${entry.createdAt}`);
  terminal.info(`Task: ${entry.taskTitle}`);
  terminal.info(`Task id: ${entry.taskId}`);
  terminal.info(`Transition: ${entry.previousStatus} -> ${entry.nextStatus}`);
  terminal.info(`Source: ${entry.source}`);
  terminal.info(`Summary: ${entry.summary}`);
  terminal.info(`Reason: ${entry.reason}`);
  terminal.info(`Artifact path: ${entry.artifactPath}`);

  if (!entry.artifactFound || !entry.artifact) {
    terminal.info("Artifact file: missing");
    return;
  }

  terminal.info(`Plan id: ${entry.artifact.planId}`);
  terminal.info(`Project id: ${entry.artifact.projectId}`);
  terminal.info(`Schema version: ${entry.artifact.schemaVersion}`);
  terminal.info(`Artifact type: ${entry.artifact.artifactType}`);
}

function resolveSelection(
  taskId?: string,
  artifactId?: string,
): { kind: "artifact"; value: string } | { kind: "task"; value: string } {
  if ((taskId && artifactId) || (!taskId && !artifactId)) {
    throw new Error('Pass exactly one of "--task <task-id>" or "--artifact <artifact-id>".');
  }

  if (artifactId) {
    return {
      kind: "artifact",
      value: artifactId,
    };
  }

  if (!taskId) {
    throw new Error('Pass exactly one of "--task <task-id>" or "--artifact <artifact-id>".');
  }

  return {
    kind: "task",
    value: taskId,
  };
}

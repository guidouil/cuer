import { TaskInspectionService, type TaskInspectionSnapshot } from "../../core/context/taskInspectionService.js";
import { readOptionValue } from "../arguments.js";
import { shortIdentifier } from "../format.js";
import { WorkspaceContext } from "../../core/context/workspaceContext.js";

import type { Event, JsonObject, JsonValue, Task } from "../../domain/index.js";
import type { Terminal } from "../terminal.js";

export function runShowTaskCommand(rootPath: string, args: string[], terminal: Terminal): void {
  const context = WorkspaceContext.open(rootPath);

  try {
    const project = context.repositories.projects.findByRootPath(rootPath);
    if (!project) {
      terminal.info('No project registered yet. Run "cuer init" or "cuer plan" first.');
      return;
    }

    const taskId = readOptionValue(args, ["--task", "--task-id"]);
    const inspectionService = new TaskInspectionService();
    const snapshot = inspectionService.inspectTask(context, project, {
      ...(taskId ? { taskId } : {}),
    });

    renderSnapshot(snapshot, terminal);
  } finally {
    context.close();
  }
}

function renderSnapshot(snapshot: TaskInspectionSnapshot, terminal: Terminal): void {
  const { task } = snapshot;

  terminal.info("Task");
  terminal.info("");
  terminal.info(`Title: ${task.title}`);
  terminal.info(`Task id: ${task.id}`);
  terminal.info(`Plan id: ${task.planId}`);
  terminal.info(`Status: ${task.status}`);
  terminal.info(`Type: ${task.type}`);
  terminal.info(`Priority: ${task.priority}`);
  terminal.info(`Created at: ${task.createdAt}`);
  terminal.info(`Updated at: ${task.updatedAt}`);
  terminal.info("");
  terminal.info("Description:");
  terminal.info(indent(task.description));
  terminal.info("");
  terminal.info("Acceptance criteria:");
  if (task.acceptanceCriteria.length === 0) {
    terminal.info("  - none");
  } else {
    for (const criterion of task.acceptanceCriteria) {
      terminal.info(`  - ${criterion}`);
    }
  }

  terminal.info("");
  terminal.info("Dependencies:");
  renderTaskList(snapshot.dependencies, terminal);

  terminal.info("");
  terminal.info("Dependents:");
  renderTaskList(snapshot.dependents, terminal);

  terminal.info("");
  terminal.info("Recent events:");
  if (snapshot.recentEvents.length === 0) {
    terminal.info("  - none");
  } else {
    for (const event of snapshot.recentEvents) {
      terminal.info(`  - ${summarizeEvent(event)}`);
    }
  }

  terminal.info("");
  terminal.info("Latest prompt:");
  if (!snapshot.latestPrompt) {
    terminal.info("  - none");
  } else {
    terminal.info(`  - ${snapshot.latestPrompt.createdAt}  ${snapshot.latestPrompt.runner} (${snapshot.latestPrompt.state})`);
    terminal.info(`    Path: ${snapshot.latestPrompt.path ?? "none"}`);
    if (snapshot.latestPrompt.content) {
      terminal.info("    Content:");
      terminal.info(indent(limitMultiline(snapshot.latestPrompt.content, 20, 1600), 6));
    } else {
      terminal.info("    Content: missing");
    }
  }

  terminal.info("");
  terminal.info("Latest artifacts:");
  if (snapshot.latestArtifacts.length === 0) {
    terminal.info("  - none");
  } else {
    for (const artifact of snapshot.latestArtifacts) {
      terminal.info(
        `  - ${artifact.createdAt}  ${shortIdentifier(artifact.artifactId)}  ${artifact.previousStatus} -> ${artifact.nextStatus}`,
      );
      terminal.info(`    Summary: ${artifact.summary}`);
      terminal.info(`    Path: ${artifact.artifactFound ? artifact.artifactPath : `missing (${artifact.artifactPath})`}`);
    }
  }
}

function renderTaskList(tasks: Task[], terminal: Terminal): void {
  if (tasks.length === 0) {
    terminal.info("  - none");
    return;
  }

  for (const task of tasks) {
    terminal.info(`  - [${task.status}] ${task.title} (${task.id})`);
  }
}

function summarizeEvent(event: Event): string {
  const details = summarizeEventPayload(event);
  return details ? `${event.createdAt}  ${event.type}  ${details}` : `${event.createdAt}  ${event.type}`;
}

function indent(value: string, spaces = 2): string {
  const prefix = " ".repeat(spaces);
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function limitMultiline(value: string, maxLines: number, maxChars: number): string {
  const truncatedChars = value.length > maxChars ? `${value.slice(0, maxChars)}\n[truncated]` : value;
  const lines = truncatedChars.split("\n");

  if (lines.length <= maxLines) {
    return truncatedChars;
  }

  return `${lines.slice(0, maxLines).join("\n")}\n[truncated]`;
}

function summarizeEventPayload(event: Event): string | null {
  if (!isJsonObject(event.payload)) {
    return null;
  }

  if (event.type === "task.status.changed" || event.type === "task.status.synced") {
    const from = readString(event.payload, "from");
    const to = readString(event.payload, "to");
    if (from && to) {
      return `${from} -> ${to}`;
    }
  }

  if (event.type === "task.execution.reported") {
    return readString(event.payload, "summary");
  }

  if (event.type === "task.run.dispatched") {
    const runner = readString(event.payload, "runner");
    const state = readString(event.payload, "state");
    if (runner && state) {
      return `${runner} (${state})`;
    }
  }

  return null;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: JsonObject, key: string): string | null {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

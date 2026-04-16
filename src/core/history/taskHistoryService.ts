import type { Event, JsonObject, JsonValue, Project, TaskExecutionReportedEventPayload, TaskExecutionResultArtifact, TaskStatus } from "../../domain/index.js";
import { executionResultArtifactExists, readExecutionResultArtifact } from "../../filesystem/workspace.js";

import type { WorkspaceContext } from "../context/workspaceContext.js";

export interface TaskHistoryOptions {
  limit?: number;
  taskId?: string;
}

export interface TaskHistoryEntry {
  artifact: TaskExecutionResultArtifact | null;
  artifactFound: boolean;
  artifactPath: string;
  createdAt: string;
  nextStatus: TaskStatus;
  previousStatus: TaskStatus;
  reason: string;
  source: string;
  summary: string;
  taskId: string;
  taskTitle: string;
}

export class TaskHistoryService {
  listHistory(context: WorkspaceContext, project: Project, options: TaskHistoryOptions = {}): TaskHistoryEntry[] {
    const events = context.repositories.events.listTaskExecutionReportsByProjectId(
      project.id,
      options.limit ?? 10,
      options.taskId,
    );

    return events.flatMap((event) => {
      const payload = parseExecutionReportedPayload(event);
      if (!payload || !event.taskId) {
        return [];
      }

      const artifactFound = executionResultArtifactExists(payload.artifactPath);
      const artifact = artifactFound ? readExecutionResultArtifact(payload.artifactPath) : null;
      const fallbackTask = artifact ? null : context.repositories.tasks.findById(event.taskId);

      return [
        {
          artifact,
          artifactFound,
          artifactPath: payload.artifactPath,
          createdAt: event.createdAt,
          nextStatus: payload.nextStatus,
          previousStatus: payload.previousStatus,
          reason: payload.reason,
          source: payload.source,
          summary: payload.summary,
          taskId: event.taskId,
          taskTitle: artifact?.taskTitle ?? fallbackTask?.title ?? event.taskId,
        },
      ];
    });
  }
}

function parseExecutionReportedPayload(event: Event): TaskExecutionReportedEventPayload | null {
  if (!isJsonObject(event.payload)) {
    return null;
  }

  const artifactId = readString(event.payload, "artifactId");
  const artifactPath = readString(event.payload, "artifactPath");
  const nextStatus = readString(event.payload, "nextStatus");
  const previousStatus = readString(event.payload, "previousStatus");
  const reason = readString(event.payload, "reason");
  const source = readString(event.payload, "source");
  const summary = readString(event.payload, "summary");

  if (!artifactId || !artifactPath || !nextStatus || !previousStatus || !reason || !source || !summary) {
    return null;
  }

  return {
    artifactId,
    artifactPath,
    nextStatus,
    previousStatus,
    reason,
    source,
    summary,
  } as TaskExecutionReportedEventPayload;
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: JsonObject, key: string): string | null {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

import type {
  Event,
  JsonObject,
  JsonValue,
  Project,
  Task,
  TaskRunDispatchedEventPayload,
} from "../../domain/index.js";
import { readTextFileIfExists } from "../../filesystem/workspace.js";
import { TaskHistoryService, type TaskHistoryEntry } from "../history/taskHistoryService.js";

import type { WorkspaceContext } from "./workspaceContext.js";

export interface TaskPromptSnapshot {
  content: string | null;
  createdAt: string;
  path: string | null;
  runner: string;
  state: string;
}

export interface TaskInspectionSnapshot {
  dependencies: Task[];
  dependents: Task[];
  latestArtifacts: TaskHistoryEntry[];
  latestPrompt: TaskPromptSnapshot | null;
  recentEvents: Event[];
  task: Task;
}

export interface TaskInspectionOptions {
  artifactLimit?: number;
  eventLimit?: number;
  taskId?: string;
}

const historyService = new TaskHistoryService();

export class TaskInspectionService {
  inspectTask(
    context: WorkspaceContext,
    project: Project,
    options: TaskInspectionOptions = {},
  ): TaskInspectionSnapshot {
    const task = resolveTask(context, project, options.taskId);
    const planTasks = context.repositories.tasks.listByPlanId(task.planId);
    const dependencies = context.repositories.taskDependencies.listByPlanId(task.planId);
    const tasksById = new Map(planTasks.map((candidate) => [candidate.id, candidate]));

    const directDependencies = dependencies
      .filter((dependency) => dependency.taskId === task.id)
      .map((dependency) => tasksById.get(dependency.dependsOnTaskId))
      .filter((candidate): candidate is Task => candidate !== undefined);

    const dependents = dependencies
      .filter((dependency) => dependency.dependsOnTaskId === task.id)
      .map((dependency) => tasksById.get(dependency.taskId))
      .filter((candidate): candidate is Task => candidate !== undefined);

    const recentEvents = context.repositories.events.listByTaskId(project.id, task.id, options.eventLimit ?? 5);
    const latestPrompt = readLatestPrompt(context, project, task.id);
    const latestArtifacts = historyService.listHistory(context, project, {
      limit: options.artifactLimit ?? 3,
      taskId: task.id,
    });

    return {
      dependencies: directDependencies,
      dependents,
      latestArtifacts,
      latestPrompt,
      recentEvents,
      task,
    };
  }
}

function resolveTask(context: WorkspaceContext, project: Project, taskId?: string): Task {
  if (taskId) {
    const task = context.repositories.tasks.findById(taskId);
    if (!task || task.projectId !== project.id) {
      throw new Error(`Task "${taskId}" was not found for the current project.`);
    }

    return task;
  }

  const tasks = context.repositories.tasks.listByProjectId(project.id);
  const runningTasks = tasks.filter((task) => task.status === "running");
  if (runningTasks.length === 1) {
    const runningTask = runningTasks[0];
    if (runningTask) {
      return runningTask;
    }
  }

  throw new Error('Pass "--task <task-id>" or ensure exactly one task is currently running.');
}

function readLatestPrompt(context: WorkspaceContext, project: Project, taskId: string): TaskPromptSnapshot | null {
  const event = context.repositories.events.findLatestByTaskIdAndType(project.id, taskId, "task.run.dispatched");
  if (!event) {
    return null;
  }

  const payload = parseRunDispatchedPayload(event);
  if (!payload) {
    return null;
  }

  return {
    content: payload.promptPath ? readTextFileIfExists(payload.promptPath) : null,
    createdAt: event.createdAt,
    path: payload.promptPath,
    runner: payload.runner,
    state: payload.state,
  };
}

function parseRunDispatchedPayload(event: Event): TaskRunDispatchedEventPayload | null {
  if (!isJsonObject(event.payload)) {
    return null;
  }

  const runner = readString(event.payload, "runner");
  const state = readString(event.payload, "state");
  const promptPath = readNullableString(event.payload, "promptPath");

  if (!runner || !state) {
    return null;
  }

  return {
    externalRunId: readNullableString(event.payload, "externalRunId"),
    planStatus: readPlanStatus(event.payload, "planStatus") ?? "ready",
    promptPath,
    runner,
    state: state === "completed" ? "completed" : "accepted",
  };
}

function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: JsonObject, key: string): string | null {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

function readNullableString(value: JsonObject, key: string): string | null {
  const candidate = value[key];
  return typeof candidate === "string" ? candidate : null;
}

function readPlanStatus(value: JsonObject, key: string): TaskRunDispatchedEventPayload["planStatus"] | null {
  const candidate = value[key];
  if (
    candidate === "draft" ||
    candidate === "ready" ||
    candidate === "running" ||
    candidate === "done" ||
    candidate === "failed"
  ) {
    return candidate;
  }

  return null;
}

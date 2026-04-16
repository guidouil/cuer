import type { PlanStatus, Task, TaskDependency, TaskStatus } from "../../domain/index.js";

import { buildDependencyMap } from "../graph/taskGraph.js";

export interface TaskTransitionContext {
  dependencies: TaskDependency[];
  tasks: Task[];
}

export function assertTaskTransitionAllowed(
  task: Task,
  nextStatus: TaskStatus,
  context: TaskTransitionContext,
): void {
  if (task.status === nextStatus) {
    throw new Error(`Task "${task.title}" is already ${nextStatus}.`);
  }

  const dependencyMap = buildDependencyMap(context.dependencies);
  const tasksById = new Map(context.tasks.map((candidate) => [candidate.id, candidate]));
  const hasIncompleteDependencies = hasTaskWithIncompleteDependencies(task.id, tasksById, dependencyMap);

  if ((nextStatus === "ready" || nextStatus === "running") && hasIncompleteDependencies) {
    throw new Error(`Task "${task.title}" still has incomplete dependencies.`);
  }

  switch (task.status) {
    case "draft":
      if (nextStatus === "ready" || nextStatus === "blocked") {
        return;
      }
      break;
    case "blocked":
      if (nextStatus === "ready") {
        return;
      }
      break;
    case "ready":
      if (nextStatus === "running" || nextStatus === "blocked") {
        return;
      }
      break;
    case "running":
      if (nextStatus === "done" || nextStatus === "failed" || nextStatus === "ready") {
        return;
      }
      break;
    case "failed":
      if (nextStatus === "ready") {
        return;
      }
      break;
    case "done":
      break;
  }

  throw new Error(`Invalid transition for task "${task.title}": ${task.status} -> ${nextStatus}.`);
}

export function synchronizeTaskAvailability(tasks: Task[], dependencies: TaskDependency[]): Task[] {
  const dependencyMap = buildDependencyMap(dependencies);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  return tasks.map((task) => {
    if (task.status === "draft" || task.status === "running" || task.status === "done" || task.status === "failed") {
      return task;
    }

    const nextStatus = hasTaskWithIncompleteDependencies(task.id, tasksById, dependencyMap) ? "blocked" : "ready";
    if (nextStatus === task.status) {
      return task;
    }

    return {
      ...task,
      status: nextStatus,
    };
  });
}

export function derivePlanStatus(tasks: Task[]): PlanStatus {
  if (tasks.length === 0) {
    return "draft";
  }

  if (tasks.some((task) => task.status === "failed")) {
    return "failed";
  }

  if (tasks.every((task) => task.status === "done")) {
    return "done";
  }

  if (tasks.some((task) => task.status === "running")) {
    return "running";
  }

  return "ready";
}

function hasTaskWithIncompleteDependencies(
  taskId: string,
  tasksById: Map<string, Task>,
  dependencyMap: Map<string, string[]>,
): boolean {
  const dependencyIds = dependencyMap.get(taskId) ?? [];

  return dependencyIds.some((dependencyId) => {
    const dependencyTask = tasksById.get(dependencyId);
    return dependencyTask !== undefined && dependencyTask.status !== "done";
  });
}

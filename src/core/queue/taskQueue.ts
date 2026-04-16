import type { Task, TaskDependency } from "../../domain/index.js";

import { buildDependencyMap } from "../graph/taskGraph.js";

export interface QueueSnapshot {
  blockedTaskIds: string[];
  doneTaskIds: string[];
  draftTaskIds: string[];
  failedTaskIds: string[];
  readyTaskIds: string[];
  runningTaskIds: string[];
}

export function computeQueueSnapshot(tasks: Task[], dependencies: TaskDependency[]): QueueSnapshot {
  const dependencyMap = buildDependencyMap(dependencies);
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  const snapshot: QueueSnapshot = {
    blockedTaskIds: [],
    doneTaskIds: [],
    draftTaskIds: [],
    failedTaskIds: [],
    readyTaskIds: [],
    runningTaskIds: [],
  };

  for (const task of tasks) {
    if (task.status === "done") {
      snapshot.doneTaskIds.push(task.id);
      continue;
    }

    if (task.status === "failed") {
      snapshot.failedTaskIds.push(task.id);
      continue;
    }

    if (task.status === "running") {
      snapshot.runningTaskIds.push(task.id);
      continue;
    }

    if (task.status === "draft") {
      snapshot.draftTaskIds.push(task.id);
      continue;
    }

    const dependencyIds = dependencyMap.get(task.id) ?? [];
    const blockedByIncompleteDependency = dependencyIds.some((dependencyId) => {
      const dependencyTask = tasksById.get(dependencyId);
      return dependencyTask !== undefined && dependencyTask.status !== "done";
    });

    if (task.status === "blocked" || blockedByIncompleteDependency) {
      snapshot.blockedTaskIds.push(task.id);
      continue;
    }

    snapshot.readyTaskIds.push(task.id);
  }

  return snapshot;
}

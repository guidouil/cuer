import type { Plan, Project, Task, TaskDependency } from "../../domain/index.js";
import { buildDependencyMap } from "../graph/taskGraph.js";
import { TaskHistoryService, type TaskHistoryEntry } from "../history/taskHistoryService.js";
import { computeQueueSnapshot, type QueueSnapshot } from "../queue/taskQueue.js";

import type { WorkspaceContext } from "./workspaceContext.js";

export interface PlanInspectionTaskView {
  latestArtifact: TaskHistoryEntry | null;
  task: Task;
}

export interface PlanInspectionSnapshot {
  dependencyMap: Map<string, string[]>;
  plan: Plan;
  queue: QueueSnapshot;
  tasks: PlanInspectionTaskView[];
}

const historyService = new TaskHistoryService();

export class PlanInspectionService {
  inspectLatestPlan(context: WorkspaceContext, project: Project): PlanInspectionSnapshot | null {
    const plan = context.repositories.plans.findLatestByProjectId(project.id);
    if (!plan) {
      return null;
    }

    const tasks = context.repositories.tasks.listByPlanId(plan.id);
    const dependencies = context.repositories.taskDependencies.listByPlanId(plan.id);
    const dependencyMap = buildDependencyMap(dependencies);
    const queue = computeQueueSnapshot(tasks, dependencies);
    const latestArtifacts = mapLatestArtifactsByTask(context, project, tasks);

    return {
      dependencyMap,
      plan,
      queue,
      tasks: tasks.map((task) => ({
        latestArtifact: latestArtifacts.get(task.id) ?? null,
        task,
      })),
    };
  }
}

function mapLatestArtifactsByTask(
  context: WorkspaceContext,
  project: Project,
  tasks: Task[],
): Map<string, TaskHistoryEntry> {
  const history = historyService.listHistory(context, project, {
    limit: Math.max(tasks.length * 5, 20),
  });
  const latestArtifacts = new Map<string, TaskHistoryEntry>();

  for (const entry of history) {
    if (!latestArtifacts.has(entry.taskId)) {
      latestArtifacts.set(entry.taskId, entry);
    }
  }

  return latestArtifacts;
}

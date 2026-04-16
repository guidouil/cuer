import type { Event, Plan, Project, Task, TaskDependency } from "../../domain/index.js";
import { buildDependencyMap } from "../graph/taskGraph.js";
import { computeQueueSnapshot, type QueueSnapshot } from "../queue/taskQueue.js";
import { ReviewService, type ReviewSnapshot } from "../review/reviewService.js";

import type { WorkspaceContext } from "./workspaceContext.js";

export interface ProjectStatusSnapshot {
  project: Project;
  plan: Plan | null;
  tasks: Task[];
  dependencies: TaskDependency[];
  dependencyMap: Map<string, string[]>;
  queue: QueueSnapshot;
  review: ReviewSnapshot;
  events: Event[];
}

const reviewService = new ReviewService();

export function getProjectStatus(context: WorkspaceContext, project: Project): ProjectStatusSnapshot {
  const plan = context.repositories.plans.findLatestByProjectId(project.id);
  const tasks = plan ? context.repositories.tasks.listByPlanId(plan.id) : [];
  const dependencies = plan ? context.repositories.taskDependencies.listByPlanId(plan.id) : [];
  const dependencyMap = buildDependencyMap(dependencies);
  const queue = computeQueueSnapshot(tasks, dependencies);
  const review = reviewService.summarize(tasks, dependencies);
  const events = context.repositories.events.listRecentByProjectId(project.id, 10);

  return {
    project,
    plan,
    tasks,
    dependencies,
    dependencyMap,
    queue,
    review,
    events,
  };
}

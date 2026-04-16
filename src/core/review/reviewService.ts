import type { Task, TaskDependency } from "../../domain/index.js";

import { computeQueueSnapshot } from "../queue/taskQueue.js";

export interface ReviewSnapshot {
  blockedTasks: number;
  completedTasks: number;
  pendingReviewTasks: number;
  totalTasks: number;
}

export class ReviewService {
  summarize(tasks: Task[], dependencies: TaskDependency[]): ReviewSnapshot {
    const queue = computeQueueSnapshot(tasks, dependencies);

    return {
      blockedTasks: queue.blockedTaskIds.length,
      completedTasks: tasks.filter((task) => task.status === "done").length,
      pendingReviewTasks: tasks.filter((task) => task.type === "review" && task.status !== "done").length,
      totalTasks: tasks.length,
    };
  }
}

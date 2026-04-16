import type { Plan, Project, Task, TaskStatus } from "../../domain/index.js";
import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";

import type { WorkspaceContext } from "../context/workspaceContext.js";

import { assertTaskTransitionAllowed, derivePlanStatus, synchronizeTaskAvailability } from "./taskTransitionEngine.js";

export interface TaskTransitionRequest {
  nextStatus: TaskStatus;
  reason: string;
  taskId: string;
  trigger: string;
}

export interface TaskTransitionResult {
  planStatus: Plan["status"];
  synchronizedTasks: Task[];
  task: Task;
}

export class TaskLifecycleService {
  transitionTask(
    context: WorkspaceContext,
    project: Project,
    plan: Plan,
    request: TaskTransitionRequest,
  ): TaskTransitionResult {
    const tasks = context.repositories.tasks.listByPlanId(plan.id);
    const dependencies = context.repositories.taskDependencies.listByPlanId(plan.id);
    const currentTask = tasks.find((task) => task.id === request.taskId);

    if (!currentTask) {
      throw new Error(`Task "${request.taskId}" was not found in plan ${plan.id}.`);
    }

    assertTaskTransitionAllowed(currentTask, request.nextStatus, { tasks, dependencies });

    const updatedAt = nowIso();
    const transitionedTask: Task = {
      ...currentTask,
      status: request.nextStatus,
      updatedAt,
    };

    const projectedTasks = tasks.map((task) => (task.id === transitionedTask.id ? transitionedTask : task));
    const synchronizedTasks = synchronizeTaskAvailability(projectedTasks, dependencies).map((task) => {
      const previousTask = projectedTasks.find((candidate) => candidate.id === task.id);
      if (!previousTask || previousTask.status === task.status) {
        return task;
      }

      return {
        ...task,
        updatedAt,
      };
    });
    const synchronizedDiff = synchronizedTasks.filter((task, index) => {
      const previousTask = projectedTasks[index];
      return previousTask !== undefined && previousTask.status !== task.status;
    });
    const nextPlanStatus = derivePlanStatus(synchronizedTasks);

    context.database.connection.transaction(() => {
      context.repositories.tasks.updateStatus(transitionedTask.id, transitionedTask.status, transitionedTask.updatedAt);

      if (synchronizedDiff.length > 0) {
        context.repositories.tasks.updateStatuses(
          synchronizedDiff.map((task) => ({
            taskId: task.id,
            status: task.status,
            updatedAt,
          })),
        );
      }

      context.repositories.events.create({
        id: createId("event"),
        projectId: project.id,
        planId: plan.id,
        taskId: transitionedTask.id,
        type: "task.status.changed",
        payload: {
          from: currentTask.status,
          to: transitionedTask.status,
          trigger: request.trigger,
          reason: request.reason,
        },
        createdAt: updatedAt,
      });

      for (const task of synchronizedDiff) {
        const previousTask = projectedTasks.find((candidate) => candidate.id === task.id);
        context.repositories.events.create({
          id: createId("event"),
          projectId: project.id,
          planId: plan.id,
          taskId: task.id,
          type: "task.status.synced",
          payload: {
            from: previousTask?.status ?? "unknown",
            to: task.status,
            trigger: request.trigger,
          },
          createdAt: updatedAt,
        });
      }

      if (plan.status !== nextPlanStatus) {
        context.repositories.plans.updateStatus(plan.id, nextPlanStatus, updatedAt);
        context.repositories.events.create({
          id: createId("event"),
          projectId: project.id,
          planId: plan.id,
          taskId: null,
          type: "plan.status.changed",
          payload: {
            from: plan.status,
            to: nextPlanStatus,
            trigger: request.trigger,
          },
          createdAt: updatedAt,
        });
      }
    })();

    return {
      planStatus: nextPlanStatus,
      synchronizedTasks: synchronizedDiff,
      task: transitionedTask,
    };
  }
}

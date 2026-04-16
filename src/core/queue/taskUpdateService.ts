import type { ExecutionResultSource, Plan, Project, Task, TaskExecutionResultArtifact, TaskStatus } from "../../domain/index.js";
import { writeExecutionResultArtifact } from "../../filesystem/workspace.js";
import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";

import type { WorkspaceContext } from "../context/workspaceContext.js";

import { TaskLifecycleService } from "./taskLifecycleService.js";
import { assertTaskTransitionAllowed } from "./taskTransitionEngine.js";

export interface UpdateTaskOptions {
  reason: string;
  status: TaskStatus;
  summary?: string;
  taskId?: string;
}

export interface UpdateTaskResult {
  artifact: TaskExecutionResultArtifact;
  artifactPath: string;
  plan: Plan;
  synchronizedTasks: Task[];
  task: Task;
}

export class TaskUpdateService {
  private readonly lifecycle = new TaskLifecycleService();

  updateTask(context: WorkspaceContext, project: Project, options: UpdateTaskOptions): UpdateTaskResult {
    const plan = context.repositories.plans.findLatestByProjectId(project.id);
    if (!plan) {
      throw new Error('No plan found. Run "cuer plan" first.');
    }

    const tasks = context.repositories.tasks.listByPlanId(plan.id);
    const dependencies = context.repositories.taskDependencies.listByPlanId(plan.id);
    const targetTask = selectTaskToUpdate(tasks, options.taskId);
    assertTaskTransitionAllowed(targetTask, options.status, { tasks, dependencies });

    const artifact = buildExecutionResultArtifact({
      nextStatus: options.status,
      planId: plan.id,
      previousStatus: targetTask.status,
      projectId: project.id,
      reason: options.reason,
      ...(options.summary ? { summary: options.summary } : {}),
      taskId: targetTask.id,
      taskTitle: targetTask.title,
    });
    const artifactPath = writeExecutionResultArtifact(context.paths, { artifact });

    const transition = this.lifecycle.transitionTask(context, project, plan, {
      nextStatus: options.status,
      reason: options.reason,
      taskId: targetTask.id,
      trigger: "task.update",
    });

    context.repositories.events.create({
      id: createId("event"),
      projectId: project.id,
      planId: plan.id,
      taskId: targetTask.id,
      type: "task.execution.reported",
      payload: {
        artifactId: artifact.artifactId,
        artifactPath,
        nextStatus: artifact.nextStatus,
        previousStatus: artifact.previousStatus,
        reason: artifact.reason,
        source: artifact.source,
        summary: artifact.summary,
      },
      createdAt: artifact.createdAt,
    });

    return {
      artifact,
      artifactPath,
      plan: {
        ...plan,
        status: transition.planStatus,
      },
      synchronizedTasks: transition.synchronizedTasks,
      task: transition.task,
    };
  }
}

function selectTaskToUpdate(tasks: Task[], taskId?: string): Task {
  if (taskId) {
    const selectedTask = tasks.find((task) => task.id === taskId);
    if (!selectedTask) {
      throw new Error(`Task "${taskId}" was not found in the latest plan.`);
    }

    return selectedTask;
  }

  const runningTasks = tasks.filter((task) => task.status === "running");
  if (runningTasks.length === 1) {
    const runningTask = runningTasks[0];
    if (runningTask) {
      return runningTask;
    }
  }

  if (runningTasks.length === 0) {
    throw new Error('No running task found. Pass "--task <id>" explicitly.');
  }

  throw new Error(`Multiple running tasks found (${runningTasks.length}). Pass "--task <id>" explicitly.`);
}

function buildExecutionResultArtifact(input: {
  nextStatus: TaskStatus;
  planId: string;
  previousStatus: TaskStatus;
  projectId: string;
  reason: string;
  summary?: string;
  taskId: string;
  taskTitle: string;
}): TaskExecutionResultArtifact {
  return {
    schemaVersion: 1,
    artifactId: createId("artifact"),
    artifactType: "task-execution-result",
    createdAt: nowIso(),
    nextStatus: input.nextStatus,
    planId: input.planId,
    previousStatus: input.previousStatus,
    projectId: input.projectId,
    reason: input.reason,
    source: inferExecutionResultSource(),
    summary: input.summary?.trim() || input.reason,
    taskId: input.taskId,
    taskTitle: input.taskTitle,
  };
}

function inferExecutionResultSource(): ExecutionResultSource {
  return "manual-cli";
}

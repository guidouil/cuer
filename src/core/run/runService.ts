import type { Plan, Project, Task, TaskDependency } from "../../domain/index.js";
import { writeRunnerPrompt } from "../../filesystem/workspace.js";
import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";

import type { WorkspaceContext } from "../context/workspaceContext.js";
import { AccountManagerService, type ResolvedAccountAccess } from "../accounts/accountManagerService.js";
import { TaskLifecycleService } from "../queue/taskLifecycleService.js";
import { synchronizeTaskAvailability } from "../queue/taskTransitionEngine.js";

import type { ExternalRunnerPort, RunnerDispatchResult } from "./runnerPort.js";

export interface RunTaskOptions {
  taskId?: string;
}

export interface RunTaskResult {
  dispatch: RunnerDispatchResult;
  gateway: {
    accountId: string;
    accountName: string;
    authMethodType: string | null;
    defaultModel: string | null;
    providerLabel: string;
    providerType: string;
  };
  plan: Plan;
  promptPath: string | null;
  synchronizedTasks: Task[];
  task: Task;
}

export class RunService {
  private readonly accountManager = new AccountManagerService();
  private readonly taskLifecycle = new TaskLifecycleService();

  constructor(private readonly runner: ExternalRunnerPort) {}

  async runNextTask(
    context: WorkspaceContext,
    project: Project,
    options: RunTaskOptions = {},
  ): Promise<RunTaskResult> {
    const gateway = this.accountManager.requireCapability(context, "execution");
    const plan = context.repositories.plans.findLatestByProjectId(project.id);
    if (!plan) {
      throw new Error('No plan found. Run "cuer plan" first.');
    }

    const tasks = context.repositories.tasks.listByPlanId(plan.id);
    const dependencies = context.repositories.taskDependencies.listByPlanId(plan.id);
    const targetTask = selectTaskToRun(tasks, dependencies, options.taskId);

    const dispatch = await this.runner.dispatch(
      {
        plan,
        project,
        task: targetTask,
      },
      {
        artifactsDir: context.paths.artifactsDir,
        logsDir: context.paths.logsDir,
        projectRoot: context.paths.rootPath,
        promptsDir: context.paths.promptsDir,
        workspaceDir: context.paths.workspaceDir,
      },
    );

    const promptPath =
      dispatch.promptDraft === undefined
        ? null
        : writeRunnerPrompt(context.paths, {
            taskId: targetTask.id,
            taskTitle: targetTask.title,
            content: dispatch.promptDraft.content,
          });

    const runningTransition = this.taskLifecycle.transitionTask(context, project, plan, {
      nextStatus: "running",
      reason: dispatch.message,
      taskId: targetTask.id,
      trigger: "run.dispatch",
    });

    let finalTask = runningTransition.task;
    let synchronizedTasks = runningTransition.synchronizedTasks;
    let planStatus = runningTransition.planStatus;

    if (dispatch.state === "completed") {
      const completionTransition = this.taskLifecycle.transitionTask(
        context,
        project,
        {
          ...plan,
          status: runningTransition.planStatus,
        },
        {
          nextStatus: "done",
          reason: dispatch.message,
          taskId: targetTask.id,
          trigger: "run.completed",
        },
      );

      finalTask = completionTransition.task;
      synchronizedTasks = mergeTaskLists(synchronizedTasks, completionTransition.synchronizedTasks);
      planStatus = completionTransition.planStatus;
    }

    context.repositories.events.create({
      id: createId("event"),
      projectId: project.id,
      planId: plan.id,
      taskId: finalTask.id,
      type: "task.run.dispatched",
      payload: {
        accountId: gateway.account.id,
        accountName: gateway.account.name,
        authMethodType: gateway.authMethod?.type ?? null,
        defaultModel: gateway.account.defaultModel,
        externalRunId: dispatch.externalRunId ?? null,
        planStatus,
        promptPath,
        providerType: gateway.provider.type,
        runner: dispatch.runnerName,
        state: dispatch.state,
      },
      createdAt: nowIso(),
    });

    return {
      dispatch,
      gateway: mapGateway(gateway),
      plan: {
        ...plan,
        status: planStatus,
      },
      promptPath,
      synchronizedTasks,
      task: finalTask,
    };
  }
}

function mapGateway(gateway: ResolvedAccountAccess): RunTaskResult["gateway"] {
  return {
    accountId: gateway.account.id,
    accountName: gateway.account.name,
    authMethodType: gateway.authMethod?.type ?? null,
    defaultModel: gateway.account.defaultModel,
    providerLabel: gateway.provider.label,
    providerType: gateway.provider.type,
  };
}

function selectTaskToRun(tasks: Task[], dependencies: TaskDependency[], taskId?: string): Task {
  const synchronizedTasks = synchronizeTaskAvailability(tasks, dependencies);
  const taskById = new Map(synchronizedTasks.map((task) => [task.id, task]));

  if (taskId) {
    const selectedTask = taskById.get(taskId);
    if (!selectedTask) {
      throw new Error(`Task "${taskId}" was not found in the latest plan.`);
    }

    if (selectedTask.status !== "ready") {
      throw new Error(`Task "${selectedTask.title}" is ${selectedTask.status}. Only ready tasks can be run.`);
    }

    return selectedTask;
  }

  const readyTask = synchronizedTasks.find((task) => task.status === "ready");
  if (!readyTask) {
    throw new Error("No ready task is available to run.");
  }

  return readyTask;
}

function mergeTaskLists(left: Task[], right: Task[]): Task[] {
  const merged = new Map<string, Task>();

  for (const task of left) {
    merged.set(task.id, task);
  }

  for (const task of right) {
    merged.set(task.id, task);
  }

  return [...merged.values()];
}

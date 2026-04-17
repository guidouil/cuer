import { getProjectStatus, type ProjectStatusSnapshot } from "../context/projectStatus.js";
import { WorkspaceContext } from "../context/workspaceContext.js";
import {
  createPlanDraftFromPlannerResponse,
  createPlannerInquiry,
  parseExternalPlannerResponse,
} from "../planner/plannerJson.js";
import { PlanningService } from "../planner/planningService.js";
import { SimplePlanner } from "../planner/simplePlanner.js";
import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";

import type {
  ExternalPlannerResponse,
  Plan,
  PlannerInquiry,
  Project,
  Task,
  TaskDependency,
} from "../../domain/index.js";
import type { WorkspaceConfig } from "../../filesystem/config.js";

export interface QueueSummary {
  blockedTaskIds: string[];
  doneTaskIds: string[];
  failedTaskIds: string[];
  readyTaskIds: string[];
  runningTaskIds: string[];
}

export interface WorkspaceProjectSummary {
  latestPlan: Plan | null;
  project: Project;
  queue: QueueSummary;
  taskCount: number;
}

export interface WorkspaceOverview {
  config: WorkspaceConfig;
  currentProject: WorkspaceProjectSummary | null;
  projects: WorkspaceProjectSummary[];
  workspacePath: string;
}

export interface PlannerInquiryResult {
  inquiry: PlannerInquiry;
  kind: "questions";
  planner: string;
  rawResponse: ExternalPlannerResponse;
  workspace: WorkspaceOverview;
}

export interface PlannerPlanResult {
  dependencies: TaskDependency[];
  kind: "plan";
  plan: Plan;
  planner: string;
  rawResponse: {
    dependencies: TaskDependency[];
    plan: Plan;
    status: ProjectStatusSnapshot;
    tasks: Task[];
  };
  tasks: Task[];
  workspace: WorkspaceOverview;
}

export type PlannerExecutionResult = PlannerInquiryResult | PlannerPlanResult;

export interface RunPlannerInput {
  goal: string;
  plannerName?: string;
  plannerResponseJson?: string;
  rootPath: string;
}

export class WorkspaceAppService {
  getWorkspaceOverview(rootPath: string): WorkspaceOverview {
    const context = WorkspaceContext.open(rootPath, { autoInitialize: true });

    try {
      return buildWorkspaceOverview(context, null);
    } finally {
      context.close();
    }
  }

  runPlanner(input: RunPlannerInput): PlannerExecutionResult {
    const context = WorkspaceContext.open(input.rootPath, { autoInitialize: true });

    try {
      const { created, project } = context.ensureProject();

      if (created) {
        recordProjectRegisteredEvent(context, project);
      }

      if (input.plannerResponseJson) {
        return this.runExternalPlanner(context, project, input);
      }

      const planningService = new PlanningService(new SimplePlanner());
      const result = planningService.createInitialPlan(context, project, input.goal);
      const status = getProjectStatus(context, project);

      return {
        kind: "plan",
        planner: result.plan.planner,
        plan: result.plan,
        dependencies: result.dependencies,
        tasks: result.tasks,
        rawResponse: {
          plan: result.plan,
          tasks: result.tasks,
          dependencies: result.dependencies,
          status,
        },
        workspace: buildWorkspaceOverview(context, project.id),
      };
    } finally {
      context.close();
    }
  }

  private runExternalPlanner(
    context: WorkspaceContext,
    project: Project,
    input: RunPlannerInput,
  ): PlannerExecutionResult {
    const rawResponse = parseExternalPlannerResponse(input.plannerResponseJson ?? "");
    const plannerName = input.plannerName?.trim() || "external-json-v1";

    if (rawResponse.mode === "ask_user") {
      const inquiry = createPlannerInquiry(rawResponse);
      const timestamp = nowIso();

      context.repositories.events.create({
        id: createId("event"),
        projectId: project.id,
        planId: null,
        taskId: null,
        type: "planner.questions.generated",
        payload: {
          blockingUnknowns: inquiry.blockingUnknowns,
          planner: plannerName,
          projectSearch: inquiry.projectSearch,
          questions: inquiry.questions,
          sourceProjectId: inquiry.sourceProjectId,
          summary: inquiry.summary,
        },
        createdAt: timestamp,
      });

      return {
        kind: "questions",
        inquiry,
        planner: plannerName,
        rawResponse,
        workspace: buildWorkspaceOverview(context, project.id),
      };
    }

    const planningService = new PlanningService();
    const draft = createPlanDraftFromPlannerResponse(rawResponse, plannerName);
    const result = planningService.createPlanFromDraft(context, project, input.goal, draft);
    const status = getProjectStatus(context, project);

    return {
      kind: "plan",
      planner: plannerName,
      plan: result.plan,
      dependencies: result.dependencies,
      tasks: result.tasks,
      rawResponse: {
        plan: result.plan,
        tasks: result.tasks,
        dependencies: result.dependencies,
        status,
      },
      workspace: buildWorkspaceOverview(context, project.id),
    };
  }
}

function buildWorkspaceOverview(context: WorkspaceContext, currentProjectId: string | null): WorkspaceOverview {
  const projectSummaries = context.repositories.projects.listAll().map((project) => buildProjectSummary(context, project));

  return {
    config: context.config,
    currentProject: projectSummaries.find((projectSummary) => projectSummary.project.id === currentProjectId) ?? null,
    projects: projectSummaries,
    workspacePath: context.paths.rootPath,
  };
}

function buildProjectSummary(context: WorkspaceContext, project: Project): WorkspaceProjectSummary {
  const status = getProjectStatus(context, project);

  return {
    latestPlan: status.plan,
    project,
    queue: {
      blockedTaskIds: status.queue.blockedTaskIds,
      doneTaskIds: status.queue.doneTaskIds,
      failedTaskIds: status.queue.failedTaskIds,
      readyTaskIds: status.queue.readyTaskIds,
      runningTaskIds: status.queue.runningTaskIds,
    },
    taskCount: status.tasks.length,
  };
}

function recordProjectRegisteredEvent(context: WorkspaceContext, project: Project): void {
  context.repositories.events.create({
    id: createId("event"),
    projectId: project.id,
    planId: null,
    taskId: null,
    type: "project.registered",
    payload: {
      rootPath: project.rootPath,
    },
    createdAt: nowIso(),
  });
}

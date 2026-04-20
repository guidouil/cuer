import type {
  Plan,
  PlanDraft,
  PlannerAnswer,
  PlannerInquiry,
  PlannerPort,
  Project,
  Task,
  TaskDependency,
} from "../../domain/index.js";
import { writePlanSnapshot } from "../../filesystem/workspace.js";
import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";

import type { WorkspaceContext } from "../context/workspaceContext.js";

export interface PlanningInquiryResult {
  inquiry: PlannerInquiry;
  kind: "questions";
  planner: string;
}

export interface PlanningResult {
  kind: "plan";
  plan: Plan;
  planner: string;
  tasks: Task[];
  dependencies: TaskDependency[];
}

export type InitialPlanningResult = PlanningInquiryResult | PlanningResult;

export class PlanningService {
  constructor(private readonly planner?: PlannerPort) {}

  createInitialPlan(
    context: WorkspaceContext,
    project: Project,
    goal: string,
    clarificationAnswers: PlannerAnswer[] = [],
  ): InitialPlanningResult {
    if (!this.planner) {
      throw new Error("Planning service is not configured with a planner.");
    }

    const plannerDecision = this.planner.createPlan({
      clarificationAnswers,
      goal,
      projectId: project.id,
      projectName: project.name,
    });

    if (plannerDecision.kind === "questions") {
      return {
        kind: "questions",
        inquiry: plannerDecision.inquiry,
        planner: this.planner.name,
      };
    }

    return this.createPlanFromDraft(context, project, plannerDecision.goal, plannerDecision.draft);
  }

  createPlanFromDraft(context: WorkspaceContext, project: Project, goal: string, draft: PlanDraft): PlanningResult {
    const timestamp = nowIso();
    const plan: Plan = {
      id: createId("plan"),
      projectId: project.id,
      goal,
      summary: draft.summary,
      status: "ready",
      planner: draft.planner,
      details: draft.details,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    const taskIds = draft.tasks.map(() => createId("task"));
    const tasksWithDependencies = new Set(draft.dependencies.map((dependency) => dependency.taskIndex));

    const tasks: Task[] = draft.tasks.map((draftTask, index) => ({
      id: taskIds[index] ?? createId("task"),
      projectId: project.id,
      planId: plan.id,
      title: draftTask.title,
      description: draftTask.description,
      status: tasksWithDependencies.has(index) ? "blocked" : "ready",
      priority: draftTask.priority,
      type: draftTask.type,
      acceptanceCriteria: draftTask.acceptanceCriteria,
      details: draftTask.details,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));

    const dependencies: TaskDependency[] = draft.dependencies.map((dependency) => ({
      id: createId("dep"),
      taskId: taskIds[dependency.taskIndex] ?? createId("task"),
      dependsOnTaskId: taskIds[dependency.dependsOnTaskIndex] ?? createId("task"),
      createdAt: timestamp,
    }));

    const payload = {
      goal,
      planner: draft.planner,
      plannerProjectId: draft.details.sourceProjectId,
      taskCount: tasks.length,
    };

    context.database.connection.transaction(() => {
      context.repositories.plans.create(plan);
      context.repositories.tasks.createMany(tasks);

      if (dependencies.length > 0) {
        context.repositories.taskDependencies.createMany(dependencies);
      }

      context.repositories.events.create({
        id: createId("event"),
        projectId: project.id,
        planId: plan.id,
        taskId: null,
        type: "plan.created",
        payload,
        createdAt: timestamp,
      });
    })();

    writePlanSnapshot(context.paths, {
      plan,
      tasks,
      dependencies,
    });

    return {
      kind: "plan",
      plan,
      planner: draft.planner,
      tasks,
      dependencies,
    };
  }
}

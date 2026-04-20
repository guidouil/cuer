import { getProjectStatus, type ProjectStatusSnapshot } from "../context/projectStatus.js";
import { WorkspaceContext } from "../context/workspaceContext.js";
import {
  createPlanDraftFromPlannerResponse,
  createPlannerInquiry,
  parseExternalPlannerResponse,
} from "../planner/plannerJson.js";
import { findPendingPlannerInquiry } from "../planner/pendingPlannerInquiry.js";
import { PlanningService } from "../planner/planningService.js";
import { SimplePlanner } from "../planner/simplePlanner.js";
import {
  AccountManagerService,
  type AccountRecord,
  type RegisterProviderAccountInput,
  type ResolvedAccountAccess,
  type UsageSummary,
} from "../accounts/accountManagerService.js";
import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";
import { resolveWorkspacePaths, workspaceExists } from "../../filesystem/workspace.js";
import type {
  AccountGatewaySummary,
  CreateProviderAccountResult,
  PlannerExecutionResult,
  PendingPlannerInquirySummary,
  ProjectWorkGatewaySummary,
  ProviderAccountSummary,
  ProviderCatalogItem,
  QueueSummary,
  UsageSummaryView,
  WorkspaceOverview,
  WorkspaceProjectSummary,
} from "./workspaceAppTypes.js";

import type {
  Plan,
  PlannerAnswer,
  PlannerInquiry,
  Project,
  Provider,
  Task,
  TaskDependency,
} from "../../domain/index.js";

export interface RunPlannerInput {
  clarificationAnswers?: PlannerAnswer[];
  goal: string;
  plannerName?: string;
  plannerResponseJson?: string;
  rootPath: string;
}

export interface CreateProviderAccountInput extends RegisterProviderAccountInput {
  rootPath: string;
}

export class WorkspaceAppService {
  private readonly accountManager = new AccountManagerService();

  createProviderAccount(input: CreateProviderAccountInput): CreateProviderAccountResult {
    const context = WorkspaceContext.open(input.rootPath, { autoInitialize: true });

    try {
      const accountRecord = this.accountManager.registerProviderAccount(context, input);

      return {
        account: mapAccountRecord(accountRecord),
        workspace: buildWorkspaceOverview(context, null, this.accountManager),
      };
    } finally {
      context.close();
    }
  }

  getWorkspaceOverview(rootPath: string): WorkspaceOverview {
    const context = WorkspaceContext.open(rootPath, { autoInitialize: true });

    try {
      return buildWorkspaceOverview(context, null, this.accountManager);
    } finally {
      context.close();
    }
  }

  tryGetWorkspaceOverview(rootPath: string): WorkspaceOverview | null {
    const paths = resolveWorkspacePaths(rootPath);
    if (!workspaceExists(paths)) {
      return null;
    }

    const context = WorkspaceContext.open(rootPath);

    try {
      return buildWorkspaceOverview(context, null, this.accountManager);
    } finally {
      context.close();
    }
  }

  getPendingPlannerInquiry(rootPath: string): PendingPlannerInquirySummary | null {
    const paths = resolveWorkspacePaths(rootPath);
    if (!workspaceExists(paths)) {
      return null;
    }

    const context = WorkspaceContext.open(rootPath);

    try {
      const project = context.repositories.projects.findByRootPath(rootPath);
      if (!project) {
        return null;
      }

      return inspectPendingPlannerInquiry(context, project);
    } finally {
      context.close();
    }
  }

  runPlanner(input: RunPlannerInput): PlannerExecutionResult {
    const context = WorkspaceContext.open(input.rootPath, { autoInitialize: true });

    try {
      const gateway = this.accountManager.requireCapability(context, "planning");
      const { created, project } = context.ensureProject();

      if (created) {
        recordProjectRegisteredEvent(context, project);
      }

      recordPlannerAccessResolvedEvent(context, project, gateway);
      if ((input.clarificationAnswers?.length ?? 0) > 0) {
        recordPlannerClarificationAnswersEvent(context, project, input);
      }

      if (input.plannerResponseJson) {
        return this.runExternalPlanner(context, project, gateway, input);
      }

      const planningService = new PlanningService(new SimplePlanner());
      const result = planningService.createInitialPlan(context, project, input.goal, input.clarificationAnswers ?? []);
      if (result.kind === "questions") {
        recordPlannerInquiryEvent(context, project, result.planner, input.goal, result.inquiry);

        return {
          kind: "questions",
          gateway: mapGateway(gateway),
          inquiry: result.inquiry,
          planner: result.planner,
          rawResponse: result.inquiry,
          workspace: buildWorkspaceOverview(context, project.id, this.accountManager),
        };
      }

      const status = getProjectStatus(context, project);

      return {
        kind: "plan",
        gateway: mapGateway(gateway),
        planner: result.planner,
        plan: result.plan,
        dependencies: result.dependencies,
        tasks: result.tasks,
        rawResponse: {
          plan: result.plan,
          tasks: result.tasks,
          dependencies: result.dependencies,
          status,
        },
        workspace: buildWorkspaceOverview(context, project.id, this.accountManager),
      };
    } finally {
      context.close();
    }
  }

  private runExternalPlanner(
    context: WorkspaceContext,
    project: Project,
    gateway: ResolvedAccountAccess,
    input: RunPlannerInput,
  ): PlannerExecutionResult {
    const rawResponse = parseExternalPlannerResponse(input.plannerResponseJson ?? "");
    const plannerName = input.plannerName?.trim() || "external-json-v1";

    if (rawResponse.mode === "ask_user") {
      const inquiry = createPlannerInquiry(rawResponse);
      recordPlannerInquiryEvent(context, project, plannerName, input.goal, inquiry);

      return {
        kind: "questions",
        gateway: mapGateway(gateway),
        inquiry,
        planner: plannerName,
        rawResponse,
        workspace: buildWorkspaceOverview(context, project.id, this.accountManager),
      };
    }

    const planningService = new PlanningService();
    const draft = createPlanDraftFromPlannerResponse(rawResponse, plannerName, {
      goal: input.goal,
      ...(input.clarificationAnswers ? { clarificationAnswers: input.clarificationAnswers } : {}),
    });
    const result = planningService.createPlanFromDraft(context, project, input.goal, draft);
    const status = getProjectStatus(context, project);

    return {
      kind: "plan",
      gateway: mapGateway(gateway),
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
      workspace: buildWorkspaceOverview(context, project.id, this.accountManager),
    };
  }
}

function buildWorkspaceOverview(
  context: WorkspaceContext,
  currentProjectId: string | null,
  accountManager: AccountManagerService,
): WorkspaceOverview {
  const projectSummaries = context.repositories.projects.listAll().map((project) => buildProjectSummary(context, project));
  const snapshot = accountManager.getSnapshot(context);

  return {
    accountManager: {
      accounts: snapshot.accounts.map(mapAccountRecord),
      projectWorkGateway: snapshot.projectWorkGateway,
      providers: snapshot.providers.map(mapProvider),
      recentUsage: snapshot.recentUsage,
      usageSummary: mapUsageSummary(snapshot.usageSummary),
    },
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
    pendingPlannerInquiry: inspectPendingPlannerInquiry(context, project),
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

function inspectPendingPlannerInquiry(
  context: WorkspaceContext,
  project: Project,
): PendingPlannerInquirySummary | null {
  return findPendingPlannerInquiry(context.repositories.events.listRecentByProjectId(project.id, 50));
}

function mapAccountRecord(record: AccountRecord): ProviderAccountSummary {
  return {
    authMethodType: record.authMethod?.type ?? null,
    baseUrl: record.account.baseUrl,
    canExecute: isCapabilityUsable(record, "execution"),
    canPlan: isCapabilityUsable(record, "planning"),
    createdAt: record.account.createdAt,
    credentialStatus: record.credential?.status ?? "missing",
    defaultModel: record.account.defaultModel,
    id: record.account.id,
    name: record.account.name,
    providerLabel: record.provider.label,
    providerType: record.provider.type,
    secretHint: record.credential?.secretHint ?? null,
    status: record.account.status,
    updatedAt: record.account.updatedAt,
  };
}

function mapGateway(gateway: ResolvedAccountAccess): AccountGatewaySummary {
  return {
    accountId: gateway.account.id,
    accountName: gateway.account.name,
    authMethodType: gateway.authMethod?.type ?? null,
    defaultModel: gateway.account.defaultModel,
    providerLabel: gateway.provider.label,
    providerType: gateway.provider.type,
  };
}

function mapProvider(provider: Provider): ProviderCatalogItem {
  return {
    baseUrlRequirement: provider.baseUrlRequirement,
    defaultBaseUrl: provider.defaultBaseUrl,
    description: provider.description,
    label: provider.label,
    supportedAuthMethods: provider.supportedAuthMethods,
    type: provider.type,
  };
}

function mapUsageSummary(summary: UsageSummary): UsageSummaryView {
  return {
    currencies: summary.currencies,
    lastRecordedAt: summary.lastRecordedAt,
    totalCost: summary.totalCost,
    totalEvents: summary.totalEvents,
  };
}

function isCapabilityUsable(record: AccountRecord, capability: "planning" | "execution"): boolean {
  if (record.account.status !== "active") {
    return false;
  }

  if (!isCredentialReady(record)) {
    return false;
  }

  const relevantPolicies = record.accessPolicies.filter((policy) => policy.active && policy.capabilities.includes(capability));

  if (relevantPolicies.length === 0) {
    return false;
  }

  if (relevantPolicies.some((policy) => policy.effect === "deny")) {
    return false;
  }

  return relevantPolicies.some((policy) => policy.effect === "allow" || policy.effect === "review");
}

function isCredentialReady(record: AccountRecord): boolean {
  if (!record.authMethod || !record.credential) {
    return false;
  }

  return record.credential.status === "configured";
}

function recordPlannerAccessResolvedEvent(
  context: WorkspaceContext,
  project: Project,
  gateway: ResolvedAccountAccess,
): void {
  context.repositories.events.create({
    id: createId("event"),
    projectId: project.id,
    planId: null,
    taskId: null,
    type: "planner.access.resolved",
    payload: {
      accountId: gateway.account.id,
      accountName: gateway.account.name,
      authMethodType: gateway.authMethod?.type ?? null,
      defaultModel: gateway.account.defaultModel,
      providerType: gateway.provider.type,
    },
    createdAt: nowIso(),
  });
}

function recordPlannerClarificationAnswersEvent(
  context: WorkspaceContext,
  project: Project,
  input: RunPlannerInput,
): void {
  context.repositories.events.create({
    id: createId("event"),
    projectId: project.id,
    planId: null,
    taskId: null,
    type: "planner.questions.answered",
    payload: {
      answers: input.clarificationAnswers ?? [],
      goal: input.goal,
    },
    createdAt: nowIso(),
  });
}

function recordPlannerInquiryEvent(
  context: WorkspaceContext,
  project: Project,
  plannerName: string,
  goal: string,
  inquiry: PlannerInquiry,
): void {
  context.repositories.events.create({
    id: createId("event"),
    projectId: project.id,
    planId: null,
    taskId: null,
    type: "planner.questions.generated",
    payload: {
      blockingUnknowns: inquiry.blockingUnknowns,
      goal,
      planner: plannerName,
      projectSearch: inquiry.projectSearch,
      questions: inquiry.questions,
      sourceProjectId: inquiry.sourceProjectId,
      summary: inquiry.summary,
    },
    createdAt: nowIso(),
  });
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

import { getProjectStatus, type ProjectStatusSnapshot } from "../context/projectStatus.js";
import { WorkspaceContext } from "../context/workspaceContext.js";
import {
  createPlanDraftFromPlannerResponse,
  createPlannerInquiry,
  parseExternalPlannerResponse,
} from "../planner/plannerJson.js";
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

import type {
  AuthMethodType,
  ExternalPlannerResponse,
  Plan,
  PlannerInquiry,
  Project,
  Provider,
  ProviderType,
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

export interface ProviderCatalogItem {
  baseUrlRequirement: Provider["baseUrlRequirement"];
  defaultBaseUrl: string | null;
  description: string;
  label: string;
  supportedAuthMethods: AuthMethodType[];
  type: ProviderType;
}

export interface ProviderAccountSummary {
  authMethodType: AuthMethodType | null;
  baseUrl: string | null;
  canExecute: boolean;
  canPlan: boolean;
  createdAt: string;
  credentialStatus: "configured" | "pending" | "missing";
  defaultModel: string | null;
  id: string;
  name: string;
  providerLabel: string;
  providerType: ProviderType;
  secretHint: string | null;
  status: string;
  updatedAt: string;
}

export interface UsageEventSummary {
  accountId: string;
  accountName: string;
  id: string;
  model: string | null;
  operation: string;
  providerLabel: string;
  providerType: ProviderType;
  recordedAt: string;
}

export interface AccountGatewaySummary {
  accountId: string;
  accountName: string;
  authMethodType: AuthMethodType | null;
  defaultModel: string | null;
  providerLabel: string;
  providerType: ProviderType;
}

export interface ProjectWorkGatewaySummary {
  accountId: string | null;
  accountName: string | null;
  authMethodType: AuthMethodType | null;
  isReady: boolean;
  providerLabel: string | null;
  providerType: ProviderType | null;
  reason: string | null;
}

export interface UsageSummaryView {
  currencies: string[];
  lastRecordedAt: string | null;
  totalCost: number | null;
  totalEvents: number;
}

export interface AccountManagerOverview {
  accounts: ProviderAccountSummary[];
  projectWorkGateway: ProjectWorkGatewaySummary;
  providers: ProviderCatalogItem[];
  recentUsage: UsageEventSummary[];
  usageSummary: UsageSummaryView;
}

export interface WorkspaceOverview {
  accountManager: AccountManagerOverview;
  config: WorkspaceConfig;
  currentProject: WorkspaceProjectSummary | null;
  projects: WorkspaceProjectSummary[];
  workspacePath: string;
}

export interface PlannerInquiryResult {
  gateway: AccountGatewaySummary;
  inquiry: PlannerInquiry;
  kind: "questions";
  planner: string;
  rawResponse: ExternalPlannerResponse;
  workspace: WorkspaceOverview;
}

export interface PlannerPlanResult {
  dependencies: TaskDependency[];
  gateway: AccountGatewaySummary;
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

export interface CreateProviderAccountInput extends RegisterProviderAccountInput {
  rootPath: string;
}

export interface CreateProviderAccountResult {
  account: ProviderAccountSummary;
  workspace: WorkspaceOverview;
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

  runPlanner(input: RunPlannerInput): PlannerExecutionResult {
    const context = WorkspaceContext.open(input.rootPath, { autoInitialize: true });

    try {
      const gateway = this.accountManager.requireCapability(context, "planning");
      const { created, project } = context.ensureProject();

      if (created) {
        recordProjectRegisteredEvent(context, project);
      }

      recordPlannerAccessResolvedEvent(context, project, gateway);

      if (input.plannerResponseJson) {
        return this.runExternalPlanner(context, project, gateway, input);
      }

      const planningService = new PlanningService(new SimplePlanner());
      const result = planningService.createInitialPlan(context, project, input.goal);
      const status = getProjectStatus(context, project);

      return {
        kind: "plan",
        gateway: mapGateway(gateway),
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
        gateway: mapGateway(gateway),
        inquiry,
        planner: plannerName,
        rawResponse,
        workspace: buildWorkspaceOverview(context, project.id, this.accountManager),
      };
    }

    const planningService = new PlanningService();
    const draft = createPlanDraftFromPlannerResponse(rawResponse, plannerName);
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

function mapAccountRecord(record: AccountRecord): ProviderAccountSummary {
  return {
    authMethodType: record.authMethod?.type ?? null,
    baseUrl: record.account.baseUrl,
    canExecute: isCapabilityAllowed(record, "execution"),
    canPlan: isCapabilityAllowed(record, "planning"),
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

function isCapabilityAllowed(record: AccountRecord, capability: "planning" | "execution"): boolean {
  const relevantPolicies = record.accessPolicies.filter((policy) => policy.active && policy.capabilities.includes(capability));

  if (relevantPolicies.length === 0) {
    return false;
  }

  if (relevantPolicies.some((policy) => policy.effect === "deny")) {
    return false;
  }

  return relevantPolicies.some((policy) => policy.effect === "allow" || policy.effect === "review");
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

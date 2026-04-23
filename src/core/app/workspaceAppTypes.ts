import type { ProjectStatusSnapshot } from "../context/projectStatus.js";
import type {
  AuthMethodType,
  ExternalPlannerResponse,
  Plan,
  PlannerInquiry,
  PlannerSource,
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

export interface PendingPlannerInquirySummary {
  createdAt: string;
  goal: string;
  inquiry: PlannerInquiry;
  planner: string;
  plannerSource: PlannerSource;
}

export interface WorkspaceProjectSummary {
  latestPlan: Plan | null;
  pendingPlannerInquiry: PendingPlannerInquirySummary | null;
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
  plannerSource: PlannerSource;
  rawResponse: ExternalPlannerResponse | PlannerInquiry;
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

export interface CreateProviderAccountResult {
  account: ProviderAccountSummary;
  workspace: WorkspaceOverview;
}

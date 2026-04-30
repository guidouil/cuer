import type {
  PendingPlannerInquirySummary,
  PlannerExecutionResult,
  ProviderAccountSummary,
  WorkspaceOverview,
} from "../src/core/app/workspaceAppTypes.js";
import type { AuthMethodType, ProviderType } from "../src/domain/index.js";

export type Screen = "project" | "accounts";
export type PlannerResult = PlannerExecutionResult;

export interface CreateProviderAccountPayload {
  authMethodType: AuthMethodType;
  baseUrl?: string | null;
  defaultModel?: string | null;
  name: string;
  providerType: ProviderType;
  secretValue?: string | null;
}

export interface ConnectOpenAiOauthPayload {
  baseUrl?: string | null;
  defaultModel?: string | null;
  name: string;
}

export interface AccountFormState {
  authMethodType: AuthMethodType;
  baseUrl: string;
  defaultModel: string;
  name: string;
  providerType: ProviderType;
  secretValue: string;
}

export interface DeleteAccountDialogState {
  accountId: string;
  accountName: string;
}

export interface WorkspaceFormState {
  path: string;
}

export interface AppState {
  accountForm: AccountFormState;
  accountPendingDeletion: DeleteAccountDialogState | null;
  deletingAccountId: string | null;
  debugPayload: unknown;
  errorMessage: string | null;
  activeWorkspacePath: string | null;
  isLoadingOverview: boolean;
  isRunningPlanner: boolean;
  isSavingWorkspace: boolean;
  isSavingAccount: boolean;
  lastPlannerResult: PlannerResult | null;
  overview: WorkspaceOverview | null;
  pendingPlannerInquiry: PendingPlannerInquirySummary | null;
  plannerActiveGoal: string | null;
  plannerClarificationAnswers: Record<string, string>;
  plannerGoal: string;
  plannerResponseFileName: string | null;
  plannerResponseJson: string | null;
  screen: Screen;
  selectedProjectId: string | null;
  workspaceForm: WorkspaceFormState;
  workspacePaths: string[];
}

export interface CreateProviderAccountResult {
  account: ProviderAccountSummary;
  workspace: WorkspaceOverview;
}

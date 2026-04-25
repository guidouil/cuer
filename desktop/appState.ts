import type {
  PendingPlannerInquirySummary,
  ProviderCatalogItem,
  WorkspaceOverview,
  WorkspaceProjectSummary,
} from "../src/core/app/workspaceAppTypes.js";
import type { AuthMethodType } from "../src/domain/index.js";
import { state } from "./state.js";
import type {
  ConnectOpenAiOauthPayload,
  CreateProviderAccountPayload,
  PlannerResult,
} from "./types.js";
import { formatProjectGatewayLabel } from "./format.js";

export function applyPlannerResult(result: PlannerResult, goal: string): void {
  state.lastPlannerResult = result;
  state.debugPayload = result.rawResponse;
  applyOverviewState(result.workspace);

  if (result.kind === "questions") {
    state.plannerActiveGoal = goal;
    state.plannerGoal = goal;
    state.pendingPlannerInquiry = {
      createdAt: new Date().toISOString(),
      goal,
      inquiry: result.inquiry,
      planner: result.planner,
      plannerSource: result.plannerSource,
    };
    state.plannerClarificationAnswers = buildClarificationAnswerState(
      result.inquiry.questions.map((question) => question.id),
      state.plannerClarificationAnswers,
    );
    return;
  }

  state.pendingPlannerInquiry = null;
  state.plannerActiveGoal = null;
  state.plannerClarificationAnswers = {};
  state.plannerGoal = "";
  resetPlannerResponseImport();
}

export function applyOverviewState(overview: WorkspaceOverview): void {
  state.overview = overview;
  ensureAccountFormDefaults(overview.accountManager.providers);
  ensureSelectedProject(overview);

  const pendingPlannerInquiry = selectPendingPlannerInquiry(overview);
  const inquiryChanged =
    pendingPlannerInquiry?.createdAt !== state.pendingPlannerInquiry?.createdAt
    || pendingPlannerInquiry?.planner !== state.pendingPlannerInquiry?.planner
    || pendingPlannerInquiry?.plannerSource !== state.pendingPlannerInquiry?.plannerSource;
  state.pendingPlannerInquiry = pendingPlannerInquiry;

  if (!pendingPlannerInquiry) {
    if (!state.lastPlannerResult || state.lastPlannerResult.kind !== "questions") {
      state.plannerActiveGoal = null;
      state.plannerClarificationAnswers = {};
      resetPlannerResponseImport();
    }
    return;
  }

  state.plannerActiveGoal = pendingPlannerInquiry.goal;
  if (state.plannerGoal.trim().length === 0) {
    state.plannerGoal = pendingPlannerInquiry.goal;
  }
  if (inquiryChanged) {
    resetPlannerResponseImport();
  }
  state.plannerClarificationAnswers = buildClarificationAnswerState(
    pendingPlannerInquiry.inquiry.questions.map((question) => question.id),
    state.plannerClarificationAnswers,
  );

  if (!state.lastPlannerResult || state.lastPlannerResult.kind !== "questions") {
    state.screen = "project";
  }
}

export function selectedProject(): WorkspaceProjectSummary | null {
  if (!state.overview) {
    return null;
  }

  return (
    state.overview.projects.find((summary) => summary.project.id === state.selectedProjectId)
    ?? currentWorkspaceProject()
    ?? state.overview.projects[0]
    ?? null
  );
}

export function currentWorkspaceProject(): WorkspaceProjectSummary | null {
  return (
    state.overview?.projects.find((summary) => summary.project.rootPath === state.overview?.workspacePath) ?? null
  );
}

export function activePlannerInquiry(): PendingPlannerInquirySummary | null {
  if (state.lastPlannerResult?.kind === "questions") {
    return {
      createdAt: new Date().toISOString(),
      goal: state.plannerActiveGoal ?? state.plannerGoal,
      inquiry: state.lastPlannerResult.inquiry,
      planner: state.lastPlannerResult.planner,
      plannerSource: state.lastPlannerResult.plannerSource,
    };
  }

  return selectedProject()?.pendingPlannerInquiry ?? state.pendingPlannerInquiry;
}

export function resumePendingPlannerInquiry(inquiry: PendingPlannerInquirySummary): void {
  state.pendingPlannerInquiry = inquiry;
  state.plannerActiveGoal = inquiry.goal;
  state.plannerGoal = inquiry.goal;
  state.plannerClarificationAnswers = buildClarificationAnswerState(
    inquiry.inquiry.questions.map((question) => question.id),
    state.plannerClarificationAnswers,
  );
  if (!requiresPlannerResponseImport(inquiry)) {
    resetPlannerResponseImport();
  }
  state.screen = "project";
}

export function selectedProvider(): ProviderCatalogItem | null {
  return (
    state.overview?.accountManager.providers.find((provider) => provider.type === state.accountForm.providerType) ?? null
  );
}

export function selectedProviderDescription(): string {
  const provider = selectedProvider();
  if (!provider) {
    return "Provider details unavailable.";
  }

  const baseUrlText =
    provider.baseUrlRequirement === "required"
      ? "Base URL required."
      : provider.defaultBaseUrl
        ? `Default ${provider.defaultBaseUrl}`
        : "Base URL optional.";

  return `${provider.description} ${baseUrlText}`;
}

export function secretFieldLabel(): string {
  switch (state.accountForm.authMethodType) {
    case "api_key":
      return "API key";
    case "oauth":
      return "OAuth token or placeholder";
    case "local_endpoint":
      return "Local auth data or placeholder";
    case "custom":
      return "Credential or placeholder auth data";
  }
}

export function shouldUseOpenAiBrowserOauth(): boolean {
  return state.accountForm.providerType === "openai" && state.accountForm.authMethodType === "oauth";
}

export function accountFormActionLabel(): string {
  if (state.isSavingAccount) {
    return shouldUseOpenAiBrowserOauth() ? "Connecting..." : "Saving...";
  }

  return shouldUseOpenAiBrowserOauth() ? "Connect in browser" : "Save account";
}

export function accountFormActionNote(): string {
  if (shouldUseOpenAiBrowserOauth()) {
    return "The desktop shell gets back only a redacted connected status after the browser flow finishes.";
  }

  return "The desktop shell only receives redacted credential hints after save.";
}

export function buildCreateProviderAccountPayload(): CreateProviderAccountPayload {
  return {
    authMethodType: state.accountForm.authMethodType,
    name: state.accountForm.name.trim(),
    providerType: state.accountForm.providerType,
    ...(state.accountForm.baseUrl.trim() ? { baseUrl: state.accountForm.baseUrl.trim() } : {}),
    ...(state.accountForm.defaultModel.trim() ? { defaultModel: state.accountForm.defaultModel.trim() } : {}),
    ...(state.accountForm.secretValue.trim() ? { secretValue: state.accountForm.secretValue.trim() } : {}),
  };
}

export function buildOpenAiOauthPayload(): ConnectOpenAiOauthPayload {
  return {
    name: state.accountForm.name.trim(),
    ...(state.accountForm.baseUrl.trim() ? { baseUrl: state.accountForm.baseUrl.trim() } : {}),
    ...(state.accountForm.defaultModel.trim() ? { defaultModel: state.accountForm.defaultModel.trim() } : {}),
  };
}

export function resetPlannerResponseImport(): void {
  state.plannerResponseFileName = null;
  state.plannerResponseJson = null;
}

export function plannerGatewayLabel(): string {
  if (state.lastPlannerResult?.kind === "questions") {
    return `Gateway ${state.lastPlannerResult.gateway.accountName} (${state.lastPlannerResult.gateway.providerLabel})`;
  }

  return formatProjectGatewayLabel(state.overview?.accountManager.projectWorkGateway ?? null);
}

export function requiresPlannerResponseImport(inquiry: PendingPlannerInquirySummary): boolean {
  return inquiry.plannerSource === "external-json";
}

function ensureSelectedProject(overview: WorkspaceOverview): void {
  if (state.selectedProjectId && overview.projects.some((summary) => summary.project.id === state.selectedProjectId)) {
    return;
  }

  state.selectedProjectId =
    overview.currentProject?.project.id
    ?? overview.projects.find((summary) => summary.project.rootPath === overview.workspacePath)?.project.id
    ?? overview.projects[0]?.project.id
    ?? null;
}

function ensureAccountFormDefaults(providers: ProviderCatalogItem[]): void {
  if (providers.length === 0) {
    return;
  }

  const provider = providers.find((candidate) => candidate.type === state.accountForm.providerType) ?? providers[0];
  if (!provider) {
    return;
  }

  state.accountForm.providerType = provider.type;

  if (!provider.supportedAuthMethods.includes(state.accountForm.authMethodType)) {
    state.accountForm.authMethodType = provider.supportedAuthMethods[0] ?? "api_key";
  }

  if (state.accountForm.baseUrl.trim().length === 0 && provider.defaultBaseUrl) {
    state.accountForm.baseUrl = provider.defaultBaseUrl;
  }
}

function selectPendingPlannerInquiry(overview: WorkspaceOverview): PendingPlannerInquirySummary | null {
  return overview.projects
    .flatMap((summary) => (summary.pendingPlannerInquiry ? [summary.pendingPlannerInquiry] : []))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function buildClarificationAnswerState(
  questionIds: string[],
  current: Record<string, string>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const questionId of questionIds) {
    next[questionId] = current[questionId] ?? "";
  }
  return next;
}

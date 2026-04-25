import type { AppState } from "./types.js";

export const state: AppState = {
  accountForm: {
    authMethodType: "api_key",
    baseUrl: "",
    defaultModel: "",
    name: "",
    providerType: "openai",
    secretValue: "",
  },
  accountPendingDeletion: null,
  deletingAccountId: null,
  debugPayload: null,
  errorMessage: null,
  isLoadingOverview: true,
  isRunningPlanner: false,
  isSavingAccount: false,
  lastPlannerResult: null,
  overview: null,
  pendingPlannerInquiry: null,
  plannerActiveGoal: null,
  plannerClarificationAnswers: {},
  plannerGoal: "",
  plannerResponseFileName: null,
  plannerResponseJson: null,
  screen: "project",
  selectedProjectId: null,
};

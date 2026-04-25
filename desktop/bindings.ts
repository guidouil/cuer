import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceOverview } from "../src/core/app/workspaceAppTypes.js";
import type { AuthMethodType, PlannerAnswer, ProviderType } from "../src/domain/index.js";
import {
  activePlannerInquiry,
  applyOverviewState,
  applyPlannerResult,
  buildCreateProviderAccountPayload,
  buildOpenAiOauthPayload,
  requiresPlannerResponseImport,
  resetPlannerResponseImport,
  resumePendingPlannerInquiry,
  selectedProvider,
  shouldUseOpenAiBrowserOauth,
} from "./appState.js";
import { normalizeError } from "./format.js";
import { state } from "./state.js";
import type { CreateProviderAccountResult, PlannerResult } from "./types.js";

export function bindUi(render: () => void): void {
  bindNavigation(render);
  bindAccountActions(render);
  bindAccountForm(render);
  bindPlannerForm(render);
  bindPlannerClarificationForm(render);
}

function bindNavigation(render: () => void): void {
  for (const link of document.querySelectorAll<HTMLElement>("[data-screen]")) {
    link.addEventListener("click", () => {
      const screen = link.dataset.screen;
      if (screen !== "project" && screen !== "accounts") {
        return;
      }

      state.screen = screen;
      state.errorMessage = null;
      if (link.dataset.projectId) {
        state.selectedProjectId = link.dataset.projectId;
      }
      render();
    });
  }
}

function bindAccountActions(render: () => void): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action="prompt-delete-account"]')) {
    button.addEventListener("click", () => {
      const accountId = button.dataset.accountId;
      const accountName = button.dataset.accountName ?? "this account";
      if (!accountId) {
        return;
      }

      state.errorMessage = null;
      state.accountPendingDeletion = {
        accountId,
        accountName,
      };
      render();
    });
  }

  const cancelButton = document.querySelector<HTMLButtonElement>('[data-action="cancel-delete-account"]');
  cancelButton?.addEventListener("click", () => {
    state.accountPendingDeletion = null;
    state.errorMessage = null;
    render();
  });

  const confirmButton = document.querySelector<HTMLButtonElement>('[data-action="confirm-delete-account"]');
  confirmButton?.addEventListener("click", async () => {
    const pendingDeletion = state.accountPendingDeletion;
    if (!pendingDeletion) {
      return;
    }

    state.errorMessage = null;
    state.deletingAccountId = pendingDeletion.accountId;
    render();

    try {
      const overview = await invoke<WorkspaceOverview>("delete_provider_account", {
        payload: {
          accountId: pendingDeletion.accountId,
        },
      });

      applyOverviewState(overview);
      state.accountPendingDeletion = null;
      state.debugPayload = overview;
    } catch (error) {
      state.errorMessage = normalizeError(error);
    } finally {
      state.deletingAccountId = null;
      render();
    }
  });

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-action="resume-pending"]')) {
    button.addEventListener("click", () => {
      const projectId = button.dataset.projectId;
      if (!projectId || !state.overview) {
        return;
      }

      const projectSummary = state.overview.projects.find((summary) => summary.project.id === projectId);
      if (!projectSummary?.pendingPlannerInquiry) {
        return;
      }

      state.selectedProjectId = projectId;
      resumePendingPlannerInquiry(projectSummary.pendingPlannerInquiry);
      render();
    });
  }
}

function bindAccountForm(render: () => void): void {
  const form = document.querySelector<HTMLFormElement>("#account-form");
  if (!form) {
    return;
  }

  const providerInput = form.querySelector<HTMLSelectElement>("#provider-type");
  providerInput?.addEventListener("change", () => {
    if (!providerInput.value) {
      return;
    }

    state.accountForm.providerType = providerInput.value as ProviderType;
    const provider = selectedProvider();
    if (provider && !provider.supportedAuthMethods.includes(state.accountForm.authMethodType)) {
      state.accountForm.authMethodType = provider.supportedAuthMethods[0] ?? "api_key";
    }
    state.accountForm.baseUrl = provider?.defaultBaseUrl ?? "";
    render();
  });

  bindFormInput(form, "#account-name", (value) => {
    state.accountForm.name = value;
  });
  bindFormInput(form, "#base-url", (value) => {
    state.accountForm.baseUrl = value;
  });
  bindFormInput(form, "#default-model", (value) => {
    state.accountForm.defaultModel = value;
  });
  bindFormInput(form, "#secret-value", (value) => {
    state.accountForm.secretValue = value;
  });

  const authMethodInput = form.querySelector<HTMLSelectElement>("#auth-method-type");
  authMethodInput?.addEventListener("change", () => {
    if (!authMethodInput.value) {
      return;
    }

    state.accountForm.authMethodType = authMethodInput.value as AuthMethodType;
    render();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const usesBrowserOauth = shouldUseOpenAiBrowserOauth();
    state.errorMessage = null;
    state.isSavingAccount = true;
    render();

    try {
      const result = usesBrowserOauth
        ? await invoke<CreateProviderAccountResult>("connect_openai_oauth", {
            payload: buildOpenAiOauthPayload(),
          })
        : await invoke<CreateProviderAccountResult>("create_provider_account", {
            payload: buildCreateProviderAccountPayload(),
          });

      applyOverviewState(result.workspace);
      state.debugPayload = result;
      state.accountForm.name = "";
      state.accountForm.defaultModel = "";
      state.accountForm.secretValue = "";
    } catch (error) {
      state.errorMessage = normalizeError(error);
    } finally {
      state.isSavingAccount = false;
      render();
    }
  });
}

function bindPlannerForm(render: () => void): void {
  const form = document.querySelector<HTMLFormElement>("#planner-form");
  if (!form) {
    return;
  }

  const goalField = form.querySelector<HTMLTextAreaElement>("#planner-goal");
  goalField?.addEventListener("input", () => {
    state.plannerGoal = goalField.value;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const goal = state.plannerGoal.trim();
    if (goal.length === 0) {
      state.errorMessage = "Enter a planning goal first.";
      render();
      return;
    }

    state.errorMessage = null;
    state.isRunningPlanner = true;
    render();

    try {
      const result = await invoke<PlannerResult>("run_planner", { goal });
      applyPlannerResult(result, goal);
    } catch (error) {
      state.errorMessage = normalizeError(error);
    } finally {
      state.isRunningPlanner = false;
      render();
    }
  });
}

function bindPlannerClarificationForm(render: () => void): void {
  const form = document.querySelector<HTMLFormElement>("#planner-clarification-form");
  if (!form) {
    return;
  }

  const plannerResponseFileInput = form.querySelector<HTMLInputElement>("#planner-response-file");
  plannerResponseFileInput?.addEventListener("change", async () => {
    const file = plannerResponseFileInput.files?.[0];
    if (!file) {
      state.plannerResponseFileName = null;
      state.plannerResponseJson = null;
      render();
      return;
    }

    try {
      state.plannerResponseFileName = file.name;
      state.plannerResponseJson = await file.text();
      state.errorMessage = null;
    } catch (error) {
      state.plannerResponseFileName = null;
      state.plannerResponseJson = null;
      state.errorMessage = normalizeError(error);
    } finally {
      render();
    }
  });

  for (const field of form.querySelectorAll<HTMLTextAreaElement>("[data-question-id]")) {
    field.addEventListener("input", () => {
      const questionId = field.dataset.questionId;
      if (!questionId) {
        return;
      }

      state.plannerClarificationAnswers[questionId] = field.value;
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const plannerInquiry = activePlannerInquiry();
    if (!plannerInquiry) {
      return;
    }

    const goal = plannerInquiry.goal.trim();
    if (goal.length === 0) {
      state.errorMessage = "Planning goal is missing.";
      render();
      return;
    }

    const requiresPlannerResponse = requiresPlannerResponseImport(plannerInquiry);
    if (requiresPlannerResponse && !state.plannerResponseJson) {
      state.errorMessage = "Import a planner response JSON file before continuing this external planner round.";
      render();
      return;
    }

    const clarificationAnswers: PlannerAnswer[] = plannerInquiry.inquiry.questions.map((question) => ({
      answer: (state.plannerClarificationAnswers[question.id] ?? "").trim(),
      question: question.question,
      questionId: question.id,
    }));

    if (clarificationAnswers.some((answer) => answer.answer.length === 0)) {
      state.errorMessage = "Answer every clarification question before continuing.";
      render();
      return;
    }

    state.errorMessage = null;
    state.isRunningPlanner = true;
    render();

    try {
      const result = await invoke<PlannerResult>("run_planner", {
        clarification_answers: clarificationAnswers,
        goal,
        ...(requiresPlannerResponse ? { planner_name: plannerInquiry.planner } : {}),
        ...(requiresPlannerResponse ? { planner_response_json: state.plannerResponseJson } : {}),
      });
      if (requiresPlannerResponse) {
        resetPlannerResponseImport();
      }
      applyPlannerResult(result, goal);
    } catch (error) {
      state.errorMessage = normalizeError(error);
    } finally {
      state.isRunningPlanner = false;
      render();
    }
  });
}

function bindFormInput(form: HTMLFormElement, selector: string, apply: (value: string) => void): void {
  const input = form.querySelector<HTMLInputElement>(selector);
  input?.addEventListener("input", () => {
    apply(input.value);
  });
}

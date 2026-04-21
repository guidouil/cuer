import { invoke } from "@tauri-apps/api/core";
import type {
  PendingPlannerInquirySummary,
  PlannerExecutionResult,
  PlannerPlanResult,
  ProjectWorkGatewaySummary,
  ProviderAccountSummary,
  ProviderCatalogItem,
  QueueSummary,
  UsageEventSummary,
  UsageSummaryView,
  WorkspaceOverview,
  WorkspaceProjectSummary,
} from "../src/core/app/workspaceAppTypes.js";
import type {
  AuthMethodType,
  Plan,
  PlannerAnswer,
  Project,
  ProviderType,
  Task,
  TaskDependency,
} from "../src/domain/index.js";

type Screen = "accounts" | "planner";

type PlannerResult = PlannerExecutionResult;

interface CreateProviderAccountPayload {
  authMethodType: AuthMethodType;
  baseUrl?: string | null;
  defaultModel?: string | null;
  name: string;
  providerType: ProviderType;
  secretValue?: string | null;
}

interface AccountFormState {
  authMethodType: AuthMethodType;
  baseUrl: string;
  defaultModel: string;
  name: string;
  providerType: ProviderType;
  secretValue: string;
}

interface AppState {
  accountForm: AccountFormState;
  debugPayload: unknown;
  errorMessage: string | null;
  isLoadingOverview: boolean;
  isRunningPlanner: boolean;
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
}

const state: AppState = {
  accountForm: {
    authMethodType: "api_key",
    baseUrl: "",
    defaultModel: "",
    name: "",
    providerType: "openai",
    secretValue: "",
  },
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
  screen: "accounts",
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

void initialize();

async function initialize(): Promise<void> {
  render();
  await loadOverview();
}

async function loadOverview(): Promise<void> {
  try {
    const overview = await invoke<WorkspaceOverview>("get_workspace_overview");
    applyOverviewState(overview);
    state.debugPayload = overview;
  } catch (error) {
    state.errorMessage = normalizeError(error);
  } finally {
    state.isLoadingOverview = false;
    render();
  }
}

function render(): void {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <img class="brand-mark" src="./assets/cuer-icon.png" alt="Cuer" />
          <div>
            <p class="eyebrow">Local-first Agents Orchestrator</p>
            <h1>Cuer</h1>
          </div>
        </div>
        <nav class="nav">
          <button class="nav-button${state.screen === "accounts" ? " is-active" : ""}" data-screen="accounts">Account Manager</button>
          <button class="nav-button${state.screen === "planner" ? " is-active" : ""}" data-screen="planner">Planner</button>
        </nav>
        <div class="sidebar-note">
          <p>${escapeHtml(state.overview?.workspacePath ?? "Loading workspace…")}</p>
        </div>
      </aside>
      <main class="content">
        ${renderError()}
        ${state.screen === "accounts" ? renderAccounts() : renderPlanner()}
        ${renderDebug()}
      </main>
    </div>
  `;

  bindNavigation();
  bindPendingPlannerActions();
  bindAccountForm();
  bindPlannerForm();
  bindPlannerClarificationForm();
}

function renderAccounts(): string {
  if (state.isLoadingOverview) {
    return `
      <section class="panel">
        <h2>Account Manager</h2>
        <p>Loading local account state…</p>
      </section>
    `;
  }

  if (!state.overview) {
    return `
      <section class="panel">
        <h2>Account Manager</h2>
        <p>Workspace state is unavailable.</p>
      </section>
    `;
  }

  const accountManager = state.overview.accountManager;
  const gatewayLabel = accountManager.projectWorkGateway.isReady
    ? `${accountManager.projectWorkGateway.accountName} (${accountManager.projectWorkGateway.providerLabel})`
    : accountManager.projectWorkGateway.reason ?? "No account gateway configured.";

  return `
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Account Manager</p>
          <h2>${escapeHtml(state.overview.config.projectName)}</h2>
        </div>
        <button class="secondary-button" data-screen="planner">Planner</button>
      </div>
      <dl class="summary-grid">
        <div>
          <dt>Workspace path</dt>
          <dd>${escapeHtml(state.overview.workspacePath)}</dd>
        </div>
        <div>
          <dt>Configured accounts</dt>
          <dd>${accountManager.accounts.length}</dd>
        </div>
        <div>
          <dt>Project gateway</dt>
          <dd>${escapeHtml(gatewayLabel)}</dd>
        </div>
        <div>
          <dt>Projects created</dt>
          <dd>${state.overview.projects.length}</dd>
        </div>
      </dl>
    </section>
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Provider Accounts</p>
          <h3>Configured access</h3>
        </div>
      </div>
      ${
        accountManager.accounts.length === 0
          ? `<p class="subtle">No provider accounts yet. Add one here before starting project work.</p>`
          : `
            <ul class="item-list">
              ${accountManager.accounts
                .map(
                  (account) => `
                    <li class="item-card">
                      <div class="item-title-row">
                        <strong>${escapeHtml(account.name)}</strong>
                        <span class="pill">${escapeHtml(account.providerLabel)}</span>
                      </div>
                      <div class="meta-row">
                        <span>Auth ${escapeHtml(account.authMethodType ?? "unconfigured")}</span>
                        <span>Credential ${escapeHtml(account.credentialStatus)}</span>
                        <span>${escapeHtml(account.status)}</span>
                      </div>
                      <p class="subtle">${escapeHtml(account.baseUrl ?? "Using provider default base URL")}</p>
                      <div class="meta-row">
                        <span>Planning ${account.canPlan ? "allowed" : "blocked"}</span>
                        <span>Execution ${account.canExecute ? "allowed" : "blocked"}</span>
                        <span>${escapeHtml(account.secretHint ?? "No secret stored yet")}</span>
                      </div>
                    </li>
                  `,
                )
                .join("")}
            </ul>
          `
      }
    </section>
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Add Provider</p>
          <h3>Register an account</h3>
        </div>
      </div>
      <form id="account-form" class="stack-form">
        <div class="field">
          <label for="account-name">Account name</label>
          <input id="account-name" name="name" value="${escapeAttribute(state.accountForm.name)}" placeholder="Primary OpenAI account" />
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="provider-type">Provider</label>
            <select id="provider-type" name="providerType">
              ${accountManager.providers
                .map(
                  (provider) => `
                    <option value="${escapeAttribute(provider.type)}"${provider.type === state.accountForm.providerType ? " selected" : ""}>
                      ${escapeHtml(provider.label)}
                    </option>
                  `,
                )
                .join("")}
            </select>
            <p class="subtle">${escapeHtml(selectedProviderDescription())}</p>
          </div>
          <div class="field">
            <label for="auth-method-type">Auth method</label>
            <select id="auth-method-type" name="authMethodType">
              ${selectedProvider()
                ?.supportedAuthMethods.map(
                  (authMethod) => `
                    <option value="${escapeAttribute(authMethod)}"${authMethod === state.accountForm.authMethodType ? " selected" : ""}>
                      ${escapeHtml(formatAuthMethod(authMethod))}
                    </option>
                  `,
                )
                .join("") ?? ""}
            </select>
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label for="base-url">API base URL</label>
            <input id="base-url" name="baseUrl" value="${escapeAttribute(state.accountForm.baseUrl)}" placeholder="${escapeAttribute(selectedProvider()?.defaultBaseUrl ?? "https://api.example.com/v1")}" />
          </div>
          <div class="field">
            <label for="default-model">Default model</label>
            <input id="default-model" name="defaultModel" value="${escapeAttribute(state.accountForm.defaultModel)}" placeholder="gpt-4.1-mini" />
          </div>
        </div>
        <div class="field">
          <label for="secret-value">${escapeHtml(secretFieldLabel())}</label>
          <input id="secret-value" name="secretValue" type="password" value="${escapeAttribute(state.accountForm.secretValue)}" placeholder="Stored locally through the secret abstraction" />
        </div>
        <div class="form-actions">
          <p class="subtle">The desktop shell only receives redacted credential hints after save.</p>
          <button class="primary-button" type="submit"${state.isSavingAccount ? " disabled" : ""}>${state.isSavingAccount ? "Saving…" : "Save account"}</button>
        </div>
      </form>
    </section>
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Usage and Cost</p>
          <h3>Accounting scaffold</h3>
        </div>
      </div>
      <dl class="summary-grid">
        <div>
          <dt>Usage events</dt>
          <dd>${accountManager.usageSummary.totalEvents}</dd>
        </div>
        <div>
          <dt>Recorded currencies</dt>
          <dd>${escapeHtml(accountManager.usageSummary.currencies.join(", ") || "None yet")}</dd>
        </div>
        <div>
          <dt>Total cost</dt>
          <dd>${renderTotalCost(accountManager.usageSummary)}</dd>
        </div>
        <div>
          <dt>Last recorded usage</dt>
          <dd>${escapeHtml(accountManager.usageSummary.lastRecordedAt ?? "No usage recorded yet")}</dd>
        </div>
      </dl>
      ${
        accountManager.recentUsage.length === 0
          ? `<p class="subtle">Usage and cost persistence is in place. Provider-backed execution still needs to write the first real usage records.</p>`
          : `
            <ul class="item-list">
              ${accountManager.recentUsage
                .map(
                  (event) => `
                    <li class="item-card">
                      <div class="item-title-row">
                        <strong>${escapeHtml(event.accountName)}</strong>
                        <span class="pill">${escapeHtml(event.providerLabel)}</span>
                      </div>
                      <div class="meta-row">
                        <span>${escapeHtml(event.operation)}</span>
                        <span>${escapeHtml(event.model ?? "model pending")}</span>
                        <span>${escapeHtml(event.recordedAt)}</span>
                      </div>
                    </li>
                  `,
                )
                .join("")}
            </ul>
          `
      }
    </section>
  `;
}

function renderPlanner(): string {
  if (state.isLoadingOverview) {
    return `
      <section class="panel">
        <h2>Planner</h2>
        <p>Loading account gateway…</p>
      </section>
    `;
  }

  if (!state.overview) {
    return `
      <section class="panel">
        <h2>Planner</h2>
        <p>Workspace state is unavailable.</p>
      </section>
    `;
  }

  const gateway = state.overview.accountManager.projectWorkGateway;

  return `
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Planner</p>
          <h2>Project work</h2>
        </div>
        <button class="secondary-button" data-screen="accounts">Account Manager</button>
      </div>
      <dl class="summary-grid">
        <div>
          <dt>Gateway</dt>
          <dd>${escapeHtml(gateway.isReady ? `${gateway.accountName} (${gateway.providerLabel})` : gateway.reason ?? "Unavailable")}</dd>
        </div>
        <div>
          <dt>Projects</dt>
          <dd>${state.overview.projects.length}</dd>
        </div>
      </dl>
    </section>
    ${
      gateway.isReady
        ? `
          <section class="panel">
            <div class="section-header">
              <div>
                <p class="eyebrow">Planner input</p>
                <h3>Create or inspect the next plan</h3>
              </div>
            </div>
            <form id="planner-form" class="stack-form">
              <div class="field">
                <label for="planner-goal">Goal</label>
                <textarea id="planner-goal" name="goal" placeholder="Describe the next objective for this workspace.">${escapeHtml(state.plannerGoal)}</textarea>
              </div>
              <div class="form-actions">
                <p class="subtle">Planner access is resolved through the Account Manager before a project plan is created.</p>
                <button class="primary-button" type="submit"${state.isRunningPlanner ? " disabled" : ""}>${state.isRunningPlanner ? "Running…" : "Run planner"}</button>
              </div>
            </form>
          </section>
        `
        : `
          <section class="panel">
            <p>Add an account in the Account Manager to unlock planning and future provider-backed runs.</p>
          </section>
        `
    }
    ${renderPlannerResult()}
    ${renderProjectSummary()}
  `;
}

function renderPlannerResult(): string {
  const plannerInquiry = activePlannerInquiry();
  if (plannerInquiry) {
    return `
      <section class="panel">
        <div class="section-header">
          <div>
            <p class="eyebrow">Planner Clarifications</p>
            <h3>${escapeHtml(plannerInquiry.inquiry.summary)}</h3>
          </div>
          <span class="pill">${escapeHtml(plannerInquiry.planner)}</span>
        </div>
        <p class="subtle">${escapeHtml(plannerGatewayLabel())}</p>
        <p class="subtle">Goal in progress: ${escapeHtml(plannerInquiry.goal)}</p>
        <ol class="item-list numbered">
          ${plannerInquiry.inquiry.questions
            .map(
              (question) => `
                <li class="item-card">
                  <strong>${escapeHtml(question.question)}</strong>
                  <p class="subtle">${escapeHtml(question.why)}</p>
                </li>
              `,
            )
            .join("")}
        </ol>
        <form id="planner-clarification-form" class="stack-form">
          <div class="field">
            <label for="planner-active-goal">Goal in progress</label>
            <textarea id="planner-active-goal" disabled>${escapeHtml(plannerInquiry.goal)}</textarea>
          </div>
          ${
            isLocalPlannerName(plannerInquiry.planner)
              ? ""
              : `
                <div class="field">
                  <label for="planner-response-file">Import planner response JSON</label>
                  <input
                    id="planner-response-file"
                    name="plannerResponseFile"
                    type="file"
                    accept=".json,application/json"
                  />
                  <p class="subtle">
                    ${escapeHtml(
                      state.plannerResponseFileName
                        ? `Selected file: ${state.plannerResponseFileName}`
                        : `Required for ${plannerInquiry.planner}. Import the next planner JSON response after answering the questions.`,
                    )}
                  </p>
                </div>
              `
          }
          ${plannerInquiry.inquiry.questions
            .map(
              (question) => `
                <div class="field">
                  <label for="planner-answer-${escapeAttribute(question.id)}">${escapeHtml(question.question)}</label>
                  <textarea
                    id="planner-answer-${escapeAttribute(question.id)}"
                    data-question-id="${escapeAttribute(question.id)}"
                    placeholder="Answer to continue planning."
                  >${escapeHtml(state.plannerClarificationAnswers[question.id] ?? "")}</textarea>
                  <p class="subtle">${escapeHtml(question.why)}</p>
                </div>
              `,
            )
            .join("")}
          <div class="form-actions">
            <p class="subtle">Answers stay local and are sent back through the shared planner service.</p>
            <button class="primary-button" type="submit"${state.isRunningPlanner ? " disabled" : ""}>${state.isRunningPlanner ? "Running…" : "Continue planning"}</button>
          </div>
        </form>
      </section>
    `;
  }

  if (!state.lastPlannerResult || state.lastPlannerResult.kind !== "plan") {
    return "";
  }

  return `
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Plan Created</p>
          <h3>${escapeHtml(state.lastPlannerResult.plan.summary)}</h3>
        </div>
        <span class="pill">${escapeHtml(state.lastPlannerResult.planner)}</span>
      </div>
      <p class="subtle">Gateway ${escapeHtml(`${state.lastPlannerResult.gateway.accountName} (${state.lastPlannerResult.gateway.providerLabel})`)}</p>
      <ul class="item-list">
        ${state.lastPlannerResult.tasks
          .map(
            (task) => `
              <li class="item-card">
                <div class="item-title-row">
                  <strong>${escapeHtml(task.title)}</strong>
                  <span class="pill">${escapeHtml(task.status)}</span>
                </div>
                <p class="task-description">${escapeHtml(task.description)}</p>
                <div class="meta-row">
                  <span>Priority ${task.priority}</span>
                  <span>${escapeHtml(task.type)}</span>
                  <span>${task.acceptanceCriteria.length} checks</span>
                </div>
              </li>
            `,
          )
          .join("")}
      </ul>
    </section>
  `;
}

function renderProjectSummary(): string {
  if (!state.overview || state.overview.projects.length === 0) {
    return `
      <section class="panel">
        <p class="subtle">Projects will appear here after the planner creates the first plan.</p>
      </section>
    `;
  }

  return `
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Projects</p>
          <h3>Persisted local plans</h3>
        </div>
      </div>
      <ul class="item-list">
        ${state.overview.projects
          .map(
            (summary) => `
              <li class="item-card">
                <div class="item-title-row">
                  <strong>${escapeHtml(summary.project.name)}</strong>
                  <div class="meta-row">
                    <span class="pill">${escapeHtml(summary.latestPlan?.status ?? "no-plan")}</span>
                    ${
                      summary.pendingPlannerInquiry
                        ? `<span class="pill">Planner waiting</span>`
                        : ""
                    }
                  </div>
                </div>
                <p class="path">${escapeHtml(summary.project.rootPath)}</p>
                <div class="meta-row">
                  <span>Tasks ${summary.taskCount}</span>
                  <span>Ready ${summary.queue.readyTaskIds.length}</span>
                  <span>Running ${summary.queue.runningTaskIds.length}</span>
                  <span>${escapeHtml(summary.pendingPlannerInquiry ? `${summary.pendingPlannerInquiry.inquiry.questions.length} pending question(s)` : "No pending planner inquiry")}</span>
                </div>
                ${
                  summary.pendingPlannerInquiry
                    ? `
                      <div class="form-actions">
                        <p class="subtle">${escapeHtml(summary.pendingPlannerInquiry.inquiry.summary)}</p>
                        <button
                          class="secondary-button"
                          type="button"
                          data-action="resume-pending"
                          data-project-id="${escapeAttribute(summary.project.id)}"
                        >
                          Resume planner
                        </button>
                      </div>
                    `
                    : ""
                }
              </li>
            `,
          )
          .join("")}
      </ul>
    </section>
  `;
}

function renderDebug(): string {
  return `
    <section class="panel debug-panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Backend payload</p>
          <h3>Debug</h3>
        </div>
      </div>
      <pre>${escapeHtml(JSON.stringify(state.debugPayload, null, 2))}</pre>
    </section>
  `;
}

function renderError(): string {
  if (!state.errorMessage) {
    return "";
  }

  return `
    <section class="error-banner">
      <strong>Action failed.</strong>
      <span>${escapeHtml(state.errorMessage)}</span>
    </section>
  `;
}

function bindNavigation(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-screen]")) {
    button.addEventListener("click", () => {
      const screen = button.dataset.screen;
      if (screen === "accounts" || screen === "planner") {
        state.screen = screen;
        render();
      }
    });
  }
}

function bindPendingPlannerActions(): void {
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

      resumePendingPlannerInquiry(projectSummary.pendingPlannerInquiry);
      render();
    });
  }
}

function bindAccountForm(): void {
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
    state.errorMessage = null;
    state.isSavingAccount = true;
    render();

    try {
      const payload: CreateProviderAccountPayload = {
        authMethodType: state.accountForm.authMethodType,
        name: state.accountForm.name.trim(),
        providerType: state.accountForm.providerType,
        ...(state.accountForm.baseUrl.trim() ? { baseUrl: state.accountForm.baseUrl.trim() } : {}),
        ...(state.accountForm.defaultModel.trim() ? { defaultModel: state.accountForm.defaultModel.trim() } : {}),
        ...(state.accountForm.secretValue.trim() ? { secretValue: state.accountForm.secretValue.trim() } : {}),
      };

      const result = await invoke<{ account: ProviderAccountSummary; workspace: WorkspaceOverview }>(
        "create_provider_account",
        { payload },
      );

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

function bindPlannerForm(): void {
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

function bindPlannerClarificationForm(): void {
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

    const requiresPlannerResponse = !isLocalPlannerName(plannerInquiry.planner);
    if (requiresPlannerResponse && !state.plannerResponseJson) {
      state.errorMessage = "Import a planner response JSON file before continuing this external planner round.";
      render();
      return;
    }

    const clarificationAnswers = plannerInquiry.inquiry.questions.map((question) => ({
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

function applyPlannerResult(result: PlannerResult, goal: string): void {
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

function applyOverviewState(overview: WorkspaceOverview): void {
  state.overview = overview;
  ensureAccountFormDefaults(overview.accountManager.providers);

  const pendingPlannerInquiry = selectPendingPlannerInquiry(overview);
  const inquiryChanged =
    pendingPlannerInquiry?.createdAt !== state.pendingPlannerInquiry?.createdAt
    || pendingPlannerInquiry?.planner !== state.pendingPlannerInquiry?.planner;
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
    state.screen = "planner";
  }
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

function activePlannerInquiry(): PendingPlannerInquirySummary | null {
  if (state.lastPlannerResult?.kind === "questions") {
    return {
      createdAt: new Date().toISOString(),
      goal: state.plannerActiveGoal ?? state.plannerGoal,
      inquiry: state.lastPlannerResult.inquiry,
      planner: state.lastPlannerResult.planner,
    };
  }

  return state.pendingPlannerInquiry;
}

function selectPendingPlannerInquiry(overview: WorkspaceOverview): PendingPlannerInquirySummary | null {
  return overview.projects
    .flatMap((summary) => (summary.pendingPlannerInquiry ? [summary.pendingPlannerInquiry] : []))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

function resumePendingPlannerInquiry(inquiry: PendingPlannerInquirySummary): void {
  state.pendingPlannerInquiry = inquiry;
  state.plannerActiveGoal = inquiry.goal;
  state.plannerGoal = inquiry.goal;
  state.plannerClarificationAnswers = buildClarificationAnswerState(
    inquiry.inquiry.questions.map((question) => question.id),
    state.plannerClarificationAnswers,
  );
  if (isLocalPlannerName(inquiry.planner)) {
    resetPlannerResponseImport();
  }
  state.screen = "planner";
}

function resetPlannerResponseImport(): void {
  state.plannerResponseFileName = null;
  state.plannerResponseJson = null;
}

function plannerGatewayLabel(): string {
  if (state.lastPlannerResult?.kind === "questions") {
    return `Gateway ${state.lastPlannerResult.gateway.accountName} (${state.lastPlannerResult.gateway.providerLabel})`;
  }

  return formatProjectGatewayLabel(state.overview?.accountManager.projectWorkGateway ?? null);
}

function selectedProvider(): ProviderCatalogItem | null {
  return (
    state.overview?.accountManager.providers.find((provider) => provider.type === state.accountForm.providerType) ?? null
  );
}

function selectedProviderDescription(): string {
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

function secretFieldLabel(): string {
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

function formatAuthMethod(authMethod: AuthMethodType): string {
  switch (authMethod) {
    case "api_key":
      return "API Key";
    case "oauth":
      return "OAuth";
    case "local_endpoint":
      return "Local Endpoint";
    case "custom":
      return "Custom";
  }
}

function renderTotalCost(summary: UsageSummaryView): string {
  if (summary.totalCost === null) {
    if (summary.currencies.length > 1) {
      return "Multi-currency";
    }

    return "Not recorded yet";
  }

  return `${summary.totalCost.toFixed(4)} ${summary.currencies[0] ?? ""}`.trim();
}

function formatProjectGatewayLabel(gateway: ProjectWorkGatewaySummary | null): string {
  if (!gateway) {
    return "Gateway status unavailable.";
  }

  if (gateway.isReady) {
    return `Gateway ${gateway.accountName ?? "Unknown account"} (${gateway.providerLabel ?? "Unknown provider"})`;
  }

  return gateway.reason ?? "Gateway unavailable.";
}

function isLocalPlannerName(planner: string): boolean {
  return planner.startsWith("simple-");
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

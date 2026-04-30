import type { WorkspaceProjectSummary } from "../src/core/app/workspaceAppTypes.js";
import type { Task } from "../src/domain/index.js";
import {
  accountFormActionLabel,
  accountFormActionNote,
  activePlannerInquiry,
  plannerGatewayLabel,
  requiresPlannerResponseImport,
  secretFieldLabel,
  selectedProject,
  selectedProvider,
  selectedProviderDescription,
  shouldUseOpenAiBrowserOauth,
} from "./appState.js";
import {
  dependencyLabel,
  escapeAttribute,
  escapeHtml,
  formatAuthMethod,
  formatProjectGatewayLabel,
  queueTotal,
  renderTotalCost,
  statusIcon,
  statusTone,
} from "./format.js";
import { state } from "./state.js";
import { workspaceDisplayName } from "./workspaceRegistry.js";

export function renderApp(): string {
  return `
    ${renderDesktopNavigation()}
    ${renderRailNavigation()}
    ${renderBottomNavigation()}
    <main class="responsive max app-main">
      ${renderError()}
      ${state.screen === "accounts" ? renderAccounts() : renderProjectWorkspace()}
      ${renderDebug()}
    </main>
    ${renderDeleteAccountDialog()}
  `;
}

function renderDesktopNavigation(): string {
  const overview = state.overview;
  return `
    <nav class="left max l app-sidebar">
      <header>
        <nav>
          <img class="circle extra brand-logo" src="./assets/cuer-icon.png" alt="Cuer" />
          <h6>Cuer</h6>
        </nav>
      </header>
      <p class="small-text upper left-padding right-padding">Project roots</p>
      ${renderWorkspaceList("wide")}
      ${renderWorkspaceForm()}
      <div class="divider"></div>
      <p class="small-text upper left-padding right-padding">Projects</p>
      ${renderProjectTree("wide")}
      <div class="max"></div>
      <div class="divider"></div>
      <a class="${state.screen === "accounts" ? "active" : ""}" data-screen="accounts">
        <i>manage_accounts</i>
        <span>Account Manager</span>
      </a>
      <p class="small-text wrap left-padding right-padding bottom-padding">${escapeHtml(overview?.workspacePath ?? "Loading workspace...")}</p>
    </nav>
  `;
}

function renderRailNavigation(): string {
  return `
    <nav class="left m">
      <header>
        <img class="circle extra brand-logo" src="./assets/cuer-icon.png" alt="Cuer" />
      </header>
      ${renderWorkspaceList("rail")}
      <div class="divider"></div>
      ${renderProjectTree("rail")}
      <div class="max"></div>
      <a class="${state.screen === "accounts" ? "active" : ""}" data-screen="accounts">
        <i>manage_accounts</i>
        <span>Accounts</span>
      </a>
    </nav>
  `;
}

function renderWorkspaceList(mode: "wide" | "rail"): string {
  const activePath = state.overview?.workspacePath ?? state.activeWorkspacePath;
  if (state.workspacePaths.length === 0 && !activePath) {
    return `
      <a>
        <i>folder_open</i>
        <span>${mode === "wide" ? "No project root" : "Roots"}</span>
      </a>
    `;
  }

  const paths = state.workspacePaths.includes(activePath ?? "")
    ? state.workspacePaths
    : activePath
      ? [activePath, ...state.workspacePaths]
      : state.workspacePaths;

  return paths
    .map((path) => {
      const isActive = path === activePath;
      return `
        <a
          class="${isActive ? "active" : ""}"
          data-action="switch-workspace"
          data-workspace-path="${escapeAttribute(path)}"
          title="${escapeAttribute(path)}"
        >
          <i>${isActive ? "folder_special" : "folder_open"}</i>
          <span>
            ${mode === "wide" ? escapeHtml(workspaceDisplayName(path)) : "Root"}
            ${mode === "wide" ? `<small>${escapeHtml(path)}</small>` : ""}
          </span>
        </a>
      `;
    })
    .join("");
}

function renderWorkspaceForm(): string {
  return `
    <form id="workspace-form" class="workspace-form left-padding right-padding">
      <div class="field label border small">
        <input
          id="workspace-path"
          name="workspacePath"
          value="${escapeAttribute(state.workspaceForm.path)}"
          placeholder="/Users/me/project"
          ${state.isSavingWorkspace ? " disabled" : ""}
        />
        <label for="workspace-path">Project directory</label>
      </div>
      <div class="row wrap">
        <button class="border small" type="button" data-action="browse-workspace"${state.isSavingWorkspace ? " disabled" : ""}>
          <i>drive_folder_upload</i>
          <span>Browse</span>
        </button>
        <button class="border small" type="submit" data-workspace-submit="add"${state.isSavingWorkspace ? " disabled" : ""}>
          <i>${state.isSavingWorkspace ? "progress_activity" : "folder_open"}</i>
          <span>Add existing</span>
        </button>
        <button class="small" type="submit" data-workspace-submit="create"${state.isSavingWorkspace ? " disabled" : ""}>
          <i>${state.isSavingWorkspace ? "progress_activity" : "create_new_folder"}</i>
          <span>Create .cuer</span>
        </button>
      </div>
    </form>
  `;
}

function renderBottomNavigation(): string {
  const project = selectedProject();
  return `
    <nav class="bottom s">
      <a class="${state.screen === "project" ? "active" : ""}" data-screen="project" ${project ? `data-project-id="${escapeAttribute(project.project.id)}"` : ""}>
        <i>account_tree</i>
        <span>Project</span>
      </a>
      <a class="${state.screen === "accounts" ? "active" : ""}" data-screen="accounts">
        <i>manage_accounts</i>
        <span>Accounts</span>
      </a>
    </nav>
  `;
}

function renderProjectTree(mode: "wide" | "rail"): string {
  if (state.isLoadingOverview) {
    return `
      <a>
        <i>hourglass_empty</i>
        <span>Loading</span>
      </a>
    `;
  }

  if (!state.overview || state.overview.projects.length === 0) {
    return `
      <a class="${state.screen === "project" ? "active" : ""}" data-screen="project">
        <i>add_circle</i>
        <span>New project</span>
      </a>
    `;
  }

  return state.overview.projects
    .map((summary) => {
      const isActive = state.screen === "project" && selectedProject()?.project.id === summary.project.id;
      const icon = summary.pendingPlannerInquiry ? "pending_actions" : "folder";
      const title = mode === "rail" ? "Project" : escapeHtml(summary.project.name);
      return `
        <a class="${isActive ? "active" : ""}" data-screen="project" data-project-id="${escapeAttribute(summary.project.id)}">
          <i>${icon}</i>
          <span>
            ${title}
            ${mode === "wide" ? `<small>${summary.taskCount} tasks</small>` : ""}
          </span>
        </a>
      `;
    })
    .join("");
}

function renderProjectWorkspace(): string {
  if (state.isLoadingOverview) {
    return `
      <article class="border">
        <h5>Loading workspace</h5>
        <progress class="circle"></progress>
      </article>
    `;
  }

  if (!state.overview) {
    return `
      <article class="border">
        <h5>Workspace state is unavailable.</h5>
      </article>
    `;
  }

  const project = selectedProject();
  if (!project) {
    return renderEmptyProjectWorkspace();
  }

  return `
    ${renderProjectHeader(project)}
    <div class="grid">
      <section class="s12 l5">
        ${renderPlanner(project)}
      </section>
      <section class="s12 l7">
        ${renderTaskBoard(project)}
      </section>
    </div>
  `;
}

function renderEmptyProjectWorkspace(): string {
  return `
    <article class="border">
      <div class="row">
        <i class="extra">account_tree</i>
        <div class="max">
          <h5>No project yet</h5>
          <p>Create the first local project plan from the planner.</p>
        </div>
      </div>
    </article>
    ${renderPlanner(null)}
  `;
}

function renderProjectHeader(project: WorkspaceProjectSummary): string {
  const gateway = state.overview?.accountManager.projectWorkGateway ?? null;
  return `
    <section class="responsive max no-padding">
      <div class="row wrap">
        <div class="max">
          <p class="small-text upper">Project workspace</p>
          <h4 class="small">${escapeHtml(project.project.name)}</h4>
          <p class="wrap">${escapeHtml(project.project.rootPath)}</p>
        </div>
        <div class="chip fill">
          <i>route</i>
          <span>${escapeHtml(project.latestPlan?.status ?? "no plan")}</span>
        </div>
        ${
          project.pendingPlannerInquiry
            ? `
              <div class="chip fill">
                <i>pending_actions</i>
                <span>Planner waiting</span>
              </div>
              <button
                class="border"
                type="button"
                data-action="resume-pending"
                data-project-id="${escapeAttribute(project.project.id)}"
              >
                <i>restart_alt</i>
                <span>Resume planner</span>
              </button>
            `
            : ""
        }
        <div class="chip">
          <i>hub</i>
          <span>${escapeHtml(gateway?.isReady ? gateway.providerLabel ?? "gateway" : "gateway blocked")}</span>
        </div>
      </div>
      <div class="grid">
        ${renderMetric("Tasks", String(project.taskCount), "task_alt")}
        ${renderMetric("Ready", String(project.queue.readyTaskIds.length), "play_arrow")}
        ${renderMetric("Running", String(project.queue.runningTaskIds.length), "progress_activity")}
        ${renderMetric("Blocked", String(project.queue.blockedTaskIds.length), "block")}
      </div>
    </section>
  `;
}

function renderMetric(label: string, value: string, icon: string): string {
  return `
    <article class="border small-padding s6 m3">
      <div class="row">
        <i>${icon}</i>
        <div>
          <p class="small-text">${escapeHtml(label)}</p>
          <h6>${escapeHtml(value)}</h6>
        </div>
      </div>
    </article>
  `;
}

function renderPlanner(project: WorkspaceProjectSummary | null): string {
  const gateway = state.overview?.accountManager.projectWorkGateway;
  const plannerInquiry = activePlannerInquiry();

  return `
    <article class="border">
      <header>
        <div class="row">
          <i>psychology</i>
          <div class="max">
            <h5>Planner</h5>
            <p>${escapeHtml(formatProjectGatewayLabel(gateway ?? null))}</p>
          </div>
        </div>
      </header>
      ${
        plannerInquiry
          ? renderPlannerClarifications()
          : gateway?.isReady
            ? renderPlannerForm(project)
            : `
              <p>Add an account in the global Account Manager to unlock planning and provider-backed runs.</p>
              <button class="border" data-screen="accounts">
                <i>manage_accounts</i>
                <span>Account Manager</span>
              </button>
            `
      }
      ${renderPlannerResult()}
    </article>
  `;
}

function renderPlannerForm(project: WorkspaceProjectSummary | null): string {
  return `
    <form id="planner-form">
      <div class="field textarea label border">
        <textarea id="planner-goal" name="goal">${escapeHtml(state.plannerGoal)}</textarea>
        <label for="planner-goal">${escapeHtml(project ? `Goal for ${project.project.name}` : "Goal")}</label>
      </div>
      <nav class="right-align">
        <button type="submit"${state.isRunningPlanner ? " disabled" : ""}>
          <i>${state.isRunningPlanner ? "progress_activity" : "send"}</i>
          <span>${state.isRunningPlanner ? "Running..." : "Run planner"}</span>
        </button>
      </nav>
    </form>
  `;
}

function renderPlannerClarifications(): string {
  const plannerInquiry = activePlannerInquiry();
  if (!plannerInquiry) {
    return "";
  }

  return `
    <div class="large-space"></div>
    <div class="row">
      <div class="max">
        <h6>${escapeHtml(plannerInquiry.inquiry.summary)}</h6>
        <p>${escapeHtml(plannerGatewayLabel())}</p>
      </div>
      <div class="chip fill">${escapeHtml(plannerInquiry.planner)}</div>
    </div>
    <form id="planner-clarification-form">
      <div class="field textarea label border">
        <textarea id="planner-active-goal" disabled>${escapeHtml(plannerInquiry.goal)}</textarea>
        <label for="planner-active-goal">Goal in progress</label>
      </div>
      ${
        requiresPlannerResponseImport(plannerInquiry)
          ? `
            <div class="field label border">
              <input id="planner-response-file" name="plannerResponseFile" type="file" accept=".json,application/json" />
              <label for="planner-response-file">Import planner response JSON</label>
            </div>
            <p>${escapeHtml(state.plannerResponseFileName ? `Selected file: ${state.plannerResponseFileName}` : `Required for ${plannerInquiry.planner}.`)}</p>
          `
          : ""
      }
      ${plannerInquiry.inquiry.questions
        .map(
          (question) => `
            <div class="field textarea label border">
              <textarea
                id="planner-answer-${escapeAttribute(question.id)}"
                data-question-id="${escapeAttribute(question.id)}"
              >${escapeHtml(state.plannerClarificationAnswers[question.id] ?? "")}</textarea>
              <label for="planner-answer-${escapeAttribute(question.id)}">${escapeHtml(question.question)}</label>
            </div>
            <p>${escapeHtml(question.why)}</p>
          `,
        )
        .join("")}
      <nav class="right-align">
        <button type="submit"${state.isRunningPlanner ? " disabled" : ""}>
          <i>${state.isRunningPlanner ? "progress_activity" : "send"}</i>
          <span>${state.isRunningPlanner ? "Running..." : "Continue planning"}</span>
        </button>
      </nav>
    </form>
  `;
}

function renderPlannerResult(): string {
  if (!state.lastPlannerResult || state.lastPlannerResult.kind !== "plan") {
    return "";
  }

  return `
    <div class="large-space"></div>
    <h6>${escapeHtml(state.lastPlannerResult.plan.summary)}</h6>
    <div class="row wrap">
      <div class="chip fill">${escapeHtml(state.lastPlannerResult.planner)}</div>
      <div class="chip">${state.lastPlannerResult.tasks.length} tasks</div>
    </div>
  `;
}

function renderTaskBoard(project: WorkspaceProjectSummary): string {
  return `
    <article class="border">
      <header>
        <div class="row">
          <i>task_alt</i>
          <div class="max">
            <h5>Tasks</h5>
            <p>${escapeHtml(project.latestPlan?.summary ?? "No plan created yet.")}</p>
          </div>
          <div class="chip">${queueTotal(project.queue)}</div>
        </div>
      </header>
      ${
        project.tasks.length === 0
          ? `<p>Tasks will appear here after the planner creates the first plan.</p>`
          : `
            <div class="task-list">
              ${project.tasks.map((task) => renderTask(project, task)).join("")}
            </div>
          `
      }
    </article>
  `;
}

function renderTask(project: WorkspaceProjectSummary, task: Task): string {
  return `
    <article class="border task-card ${statusTone(task.status)}">
      <div class="row top-align">
        <i>${statusIcon(task.status)}</i>
        <div class="max">
          <div class="row wrap">
            <strong class="max">${escapeHtml(task.title)}</strong>
            <div class="chip">${escapeHtml(task.status)}</div>
          </div>
          <p>${escapeHtml(task.description)}</p>
          <div class="row wrap small-text">
            <span>Priority ${task.priority}</span>
            <span>${escapeHtml(task.type)}</span>
            <span>${task.acceptanceCriteria.length} checks</span>
            <span>${escapeHtml(dependencyLabel(task, project.tasks, project.dependencies))}</span>
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderAccounts(): string {
  if (state.isLoadingOverview) {
    return `
      <article class="border">
        <h5>Loading local account state</h5>
        <progress class="circle"></progress>
      </article>
    `;
  }

  if (!state.overview) {
    return `
      <article class="border">
        <h5>Workspace state is unavailable.</h5>
      </article>
    `;
  }

  const accountManager = state.overview.accountManager;
  return `
    <section class="responsive max no-padding">
      <div class="row wrap">
        <div class="max">
          <p class="small-text upper">Global</p>
          <h4 class="small">Account Manager</h4>
          <p>${escapeHtml(formatProjectGatewayLabel(accountManager.projectWorkGateway))}</p>
        </div>
      </div>
      <div class="grid">
        ${renderMetric("Accounts", String(accountManager.accounts.length), "manage_accounts")}
        ${renderMetric("Projects", String(state.overview.projects.length), "account_tree")}
        ${renderMetric("Usage", String(accountManager.usageSummary.totalEvents), "receipt_long")}
        ${renderMetric("Cost", renderTotalCost(accountManager.usageSummary), "payments")}
      </div>
    </section>
    <div class="grid">
      <section class="s12 l7">
        ${renderProviderAccounts()}
        ${renderUsage()}
      </section>
      <section class="s12 l5">
        ${renderAccountForm()}
      </section>
    </div>
  `;
}

function renderProviderAccounts(): string {
  const accountManager = state.overview?.accountManager;
  if (!accountManager) {
    return "";
  }

  return `
    <article class="border">
      <header>
        <h5>Configured access</h5>
      </header>
      ${
        accountManager.accounts.length === 0
          ? `<p>No provider accounts yet.</p>`
          : accountManager.accounts.map((account) => renderProviderAccount(account)).join("")
      }
    </article>
  `;
}

function renderProviderAccount(account: (NonNullable<typeof state.overview>)["accountManager"]["accounts"][number]): string {
  return `
    <article class="border small-padding">
      <div class="row wrap">
        <i>key</i>
        <div class="max">
          <strong>${escapeHtml(account.name)}</strong>
          <p>${escapeHtml(account.baseUrl ?? "Using provider default base URL")}</p>
        </div>
        <div class="chip fill">${escapeHtml(account.providerLabel)}</div>
        <button
          class="circle transparent"
          type="button"
          data-action="prompt-delete-account"
          data-account-id="${escapeAttribute(account.id)}"
          data-account-name="${escapeAttribute(account.name)}"
          aria-label="${escapeAttribute(`Delete ${account.name}`)}"
          title="Delete configuration"
          ${state.deletingAccountId === account.id ? " disabled" : ""}
        >
          <i>delete</i>
        </button>
      </div>
      <div class="row wrap small-text">
        <span>Auth ${escapeHtml(account.authMethodType ?? "unconfigured")}</span>
        <span>Credential ${escapeHtml(account.credentialStatus)}</span>
        <span>${escapeHtml(account.status)}</span>
        <span>Planning ${account.canPlan ? "allowed" : "blocked"}</span>
        <span>Execution ${account.canExecute ? "allowed" : "blocked"}</span>
        <span>${escapeHtml(account.secretHint ?? "No secret stored yet")}</span>
      </div>
    </article>
  `;
}

function renderAccountForm(): string {
  const accountManager = state.overview?.accountManager;
  if (!accountManager) {
    return "";
  }

  return `
    <article class="border">
      <header>
        <h5>Register an account</h5>
      </header>
      <form id="account-form">
        <div class="field label border">
          <input id="account-name" name="name" value="${escapeAttribute(state.accountForm.name)}" />
          <label for="account-name">Account name</label>
        </div>
        <div class="grid">
          <div class="field label border s12 m6">
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
            <label for="provider-type">Provider</label>
          </div>
          <div class="field label border s12 m6">
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
            <label for="auth-method-type">Auth method</label>
          </div>
        </div>
        <p>${escapeHtml(selectedProviderDescription())}</p>
        <div class="grid">
          <div class="field label border s12 m6">
            <input id="base-url" name="baseUrl" value="${escapeAttribute(state.accountForm.baseUrl)}" placeholder="${escapeAttribute(selectedProvider()?.defaultBaseUrl ?? "https://api.example.com/v1")}" />
            <label for="base-url">API base URL</label>
          </div>
          <div class="field label border s12 m6">
            <input id="default-model" name="defaultModel" value="${escapeAttribute(state.accountForm.defaultModel)}" placeholder="gpt-4.1-mini" />
            <label for="default-model">Default model</label>
          </div>
        </div>
        ${
          shouldUseOpenAiBrowserOauth()
            ? `<p>Connects in your default browser, returns to Cuer, and stores tokens locally through the OS secret store.</p>`
            : `
              <div class="field label border">
                <input id="secret-value" name="secretValue" type="password" value="${escapeAttribute(state.accountForm.secretValue)}" />
                <label for="secret-value">${escapeHtml(secretFieldLabel())}</label>
              </div>
            `
        }
        <nav class="right-align">
          <span class="max">${escapeHtml(accountFormActionNote())}</span>
          <button type="submit"${state.isSavingAccount ? " disabled" : ""}>
            <i>${state.isSavingAccount ? "progress_activity" : "save"}</i>
            <span>${escapeHtml(accountFormActionLabel())}</span>
          </button>
        </nav>
      </form>
    </article>
  `;
}

function renderUsage(): string {
  const accountManager = state.overview?.accountManager;
  if (!accountManager) {
    return "";
  }

  return `
    <article class="border">
      <header>
        <h5>Usage and Cost</h5>
      </header>
      ${
        accountManager.recentUsage.length === 0
          ? `<p>Usage and cost persistence is in place. Provider-backed execution still needs to write the first real usage records.</p>`
          : accountManager.recentUsage
              .map(
                (event) => `
                  <article class="border small-padding">
                    <div class="row wrap">
                      <strong class="max">${escapeHtml(event.accountName)}</strong>
                      <div class="chip">${escapeHtml(event.providerLabel)}</div>
                    </div>
                    <div class="row wrap small-text">
                      <span>${escapeHtml(event.operation)}</span>
                      <span>${escapeHtml(event.model ?? "model pending")}</span>
                      <span>${escapeHtml(event.recordedAt)}</span>
                    </div>
                  </article>
                `,
              )
              .join("")
      }
    </article>
  `;
}

function renderDeleteAccountDialog(): string {
  if (!state.accountPendingDeletion) {
    return "";
  }

  const isDeleting = state.deletingAccountId === state.accountPendingDeletion.accountId;

  return `
    <dialog class="active" role="dialog" aria-modal="true">
      <h5>Remove ${escapeHtml(state.accountPendingDeletion.accountName)}?</h5>
      <p>This removes the saved account configuration, deletes any stored secret from the OS keychain, and clears the related local account records.</p>
      ${
        state.errorMessage
          ? `<article class="error-container">${escapeHtml(state.errorMessage)}</article>`
          : ""
      }
      <nav class="right-align">
        <button class="border" type="button" data-action="cancel-delete-account"${isDeleting ? " disabled" : ""}>Cancel</button>
        <button class="error" type="button" data-action="confirm-delete-account"${isDeleting ? " disabled" : ""}>
          <i>${isDeleting ? "progress_activity" : "delete"}</i>
          <span>${isDeleting ? "Deleting..." : "Delete configuration"}</span>
        </button>
      </nav>
    </dialog>
    <div class="overlay active"></div>
  `;
}

function renderError(): string {
  if (!state.errorMessage || state.accountPendingDeletion) {
    return "";
  }

  return `
    <article class="error-container">
      <strong>Action failed.</strong>
      <p>${escapeHtml(state.errorMessage)}</p>
    </article>
  `;
}

function renderDebug(): string {
  return `
    <details class="debug-details">
      <summary class="button border">
        <i>data_object</i>
        <span>Backend payload</span>
      </summary>
      <pre>${escapeHtml(JSON.stringify(state.debugPayload, null, 2))}</pre>
    </details>
  `;
}

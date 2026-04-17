import { invoke } from "@tauri-apps/api/core";

type Screen = "home" | "planner";

interface WorkspaceConfig {
  createdAt: string;
  defaultPlanner: string;
  defaultRunner: string;
  projectName: string;
  projectRoot: string;
  schemaVersion: number;
  updatedAt: string;
}

interface Project {
  createdAt: string;
  id: string;
  name: string;
  rootPath: string;
  updatedAt: string;
}

interface Plan {
  createdAt: string;
  goal: string;
  id: string;
  planner: string;
  status: string;
  summary: string;
  updatedAt: string;
}

interface QueueSummary {
  blockedTaskIds: string[];
  doneTaskIds: string[];
  failedTaskIds: string[];
  readyTaskIds: string[];
  runningTaskIds: string[];
}

interface WorkspaceProjectSummary {
  latestPlan: Plan | null;
  project: Project;
  queue: QueueSummary;
  taskCount: number;
}

interface WorkspaceOverview {
  config: WorkspaceConfig;
  currentProject: WorkspaceProjectSummary | null;
  projects: WorkspaceProjectSummary[];
  workspacePath: string;
}

interface TaskDependency {
  dependsOnTaskId: string;
  id: string;
  taskId: string;
}

interface Task {
  acceptanceCriteria: string[];
  description: string;
  id: string;
  priority: number;
  status: string;
  title: string;
  type: string;
}

interface PlannerQuestion {
  id: string;
  question: string;
  why: string;
}

interface PlannerInquiry {
  blockingUnknowns: string[];
  questions: PlannerQuestion[];
  sourceProjectId: string;
  summary: string;
}

interface PlannerQuestionsResult {
  inquiry: PlannerInquiry;
  kind: "questions";
  planner: string;
  rawResponse: unknown;
  workspace: WorkspaceOverview;
}

interface PlannerPlanResult {
  dependencies: TaskDependency[];
  kind: "plan";
  plan: Plan;
  planner: string;
  rawResponse: unknown;
  tasks: Task[];
  workspace: WorkspaceOverview;
}

type PlannerResult = PlannerQuestionsResult | PlannerPlanResult;

interface AppState {
  debugPayload: unknown;
  errorMessage: string | null;
  isLoadingOverview: boolean;
  isRunningPlanner: boolean;
  lastPlannerResult: PlannerResult | null;
  overview: WorkspaceOverview | null;
  plannerGoal: string;
  screen: Screen;
}

const state: AppState = {
  debugPayload: null,
  errorMessage: null,
  isLoadingOverview: true,
  isRunningPlanner: false,
  lastPlannerResult: null,
  overview: null,
  plannerGoal: "",
  screen: "home",
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

void initialize();

async function initialize(): Promise<void> {
  render();

  try {
    const overview = await invoke<WorkspaceOverview>("get_workspace_overview");
    state.overview = overview;
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
            <p class="eyebrow">Local-first desktop planner</p>
            <h1>Cuer</h1>
          </div>
        </div>
        <nav class="nav">
          <button class="nav-button${state.screen === "home" ? " is-active" : ""}" data-screen="home">Home</button>
          <button class="nav-button${state.screen === "planner" ? " is-active" : ""}" data-screen="planner">Run Planner</button>
        </nav>
        <div class="sidebar-note">
          <p>${escapeHtml(state.overview?.workspacePath ?? "Loading workspace…")}</p>
        </div>
      </aside>
      <main class="content">
        ${renderError()}
        ${state.screen === "home" ? renderHome() : renderPlanner()}
        ${renderDebug()}
      </main>
    </div>
  `;

  bindNavigation();
  bindPlannerForm();
}

function renderHome(): string {
  if (state.isLoadingOverview) {
    return `
      <section class="panel">
        <h2>Workspace</h2>
        <p>Loading local state…</p>
      </section>
    `;
  }

  if (!state.overview) {
    return `
      <section class="panel">
        <h2>Workspace</h2>
        <p>Workspace state is unavailable.</p>
      </section>
    `;
  }

  const selectedPath = state.overview.currentProject?.project.rootPath ?? state.overview.workspacePath;

  return `
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Workspace</p>
          <h2>${escapeHtml(state.overview.config.projectName)}</h2>
        </div>
        <button class="secondary-button" data-screen="planner">Plan a project</button>
      </div>
      <dl class="summary-grid">
        <div>
          <dt>Workspace path</dt>
          <dd>${escapeHtml(state.overview.workspacePath)}</dd>
        </div>
        <div>
          <dt>Selected path</dt>
          <dd>${escapeHtml(selectedPath)}</dd>
        </div>
        <div>
          <dt>Planner</dt>
          <dd>${escapeHtml(state.overview.config.defaultPlanner)}</dd>
        </div>
        <div>
          <dt>Runner</dt>
          <dd>${escapeHtml(state.overview.config.defaultRunner)}</dd>
        </div>
        <div>
          <dt>Provider settings</dt>
          <dd>Pending local settings</dd>
        </div>
        <div>
          <dt>Projects</dt>
          <dd>${state.overview.projects.length}</dd>
        </div>
      </dl>
    </section>
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Projects</p>
          <h2>Local projects</h2>
        </div>
      </div>
      ${
        state.overview.projects.length === 0
          ? `<p>No projects registered yet.</p>`
          : `<ul class="item-list">
              ${state.overview.projects
                .map(
                  (projectSummary) => `
                    <li class="item-card">
                      <div class="item-title-row">
                        <h3>${escapeHtml(projectSummary.project.name)}</h3>
                        <span class="pill">${projectSummary.taskCount} tasks</span>
                      </div>
                      <p class="path">${escapeHtml(projectSummary.project.rootPath)}</p>
                      <div class="meta-row">
                        <span>${projectSummary.queue.readyTaskIds.length} ready</span>
                        <span>${projectSummary.queue.blockedTaskIds.length} blocked</span>
                        <span>${projectSummary.queue.runningTaskIds.length} running</span>
                      </div>
                      <p class="plan-summary">${escapeHtml(projectSummary.latestPlan?.summary ?? "No plan created yet.")}</p>
                    </li>
                  `,
                )
                .join("")}
            </ul>`
      }
    </section>
  `;
}

function renderPlanner(): string {
  const result = state.lastPlannerResult;

  return `
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Planner</p>
          <h2>Run planner</h2>
        </div>
      </div>
      <form id="planner-form" class="planner-form">
        <label class="field">
          <span>Project prompt</span>
          <textarea
            id="planner-goal"
            name="goal"
            rows="8"
            placeholder="Create the first visible Tauri app on top of the CLI without duplicating core logic."
            ${state.isRunningPlanner ? "disabled" : ""}
          >${escapeHtml(state.plannerGoal)}</textarea>
        </label>
        <div class="form-actions">
          <button class="primary-button" type="submit" ${state.isRunningPlanner ? "disabled" : ""}>
            ${state.isRunningPlanner ? "Running…" : "Run Planner"}
          </button>
        </div>
      </form>
    </section>
    <section class="panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Result</p>
          <h2>${result ? "Latest planner response" : "No planner run yet"}</h2>
        </div>
      </div>
      ${renderPlannerResult(result)}
    </section>
  `;
}

function renderPlannerResult(result: PlannerResult | null): string {
  if (!result) {
    return "<p>Enter a prompt to create a plan.</p>";
  }

  if (result.kind === "questions") {
    return `
      <div class="result-block">
        <p class="result-summary">${escapeHtml(result.inquiry.summary)}</p>
        <h3>Blocking unknowns</h3>
        ${
          result.inquiry.blockingUnknowns.length === 0
            ? "<p>None.</p>"
            : `<ul class="bullet-list">
                ${result.inquiry.blockingUnknowns.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
              </ul>`
        }
        <h3>Questions</h3>
        <ul class="item-list">
          ${result.inquiry.questions
            .map(
              (question) => `
                <li class="item-card">
                  <div class="item-title-row">
                    <h4>${escapeHtml(question.id)}</h4>
                  </div>
                  <p>${escapeHtml(question.question)}</p>
                  <p class="subtle">${escapeHtml(question.why)}</p>
                </li>
              `,
            )
            .join("")}
        </ul>
      </div>
    `;
  }

  const dependencyCountByTaskId = new Map<string, number>();
  for (const dependency of result.dependencies) {
    dependencyCountByTaskId.set(
      dependency.taskId,
      (dependencyCountByTaskId.get(dependency.taskId) ?? 0) + 1,
    );
  }

  return `
    <div class="result-block">
      <p class="result-summary">${escapeHtml(result.plan.summary)}</p>
      <div class="meta-row">
        <span>Plan ${escapeHtml(result.plan.id)}</span>
        <span>${result.tasks.length} tasks</span>
        <span>${escapeHtml(result.planner)}</span>
      </div>
      <ol class="item-list numbered">
        ${result.tasks
          .map(
            (task) => `
              <li class="item-card">
                <div class="item-title-row">
                  <h4>${escapeHtml(task.title)}</h4>
                  <span class="pill">${escapeHtml(task.status)}</span>
                </div>
                <div class="meta-row">
                  <span>P${task.priority}</span>
                  <span>${escapeHtml(task.type)}</span>
                  <span>${dependencyCountByTaskId.get(task.id) ?? 0} dependencies</span>
                </div>
                <p class="task-description">${escapeMultiline(task.description)}</p>
              </li>
            `,
          )
          .join("")}
      </ol>
    </div>
  `;
}

function renderDebug(): string {
  return `
    <section class="panel debug-panel">
      <div class="section-header">
        <div>
          <p class="eyebrow">Debug</p>
          <h2>Raw backend response</h2>
        </div>
      </div>
      <pre>${escapeHtml(JSON.stringify(state.debugPayload, null, 2) ?? "null")}</pre>
    </section>
  `;
}

function renderError(): string {
  if (!state.errorMessage) {
    return "";
  }

  return `
    <section class="error-banner">
      <p>${escapeHtml(state.errorMessage)}</p>
    </section>
  `;
}

function bindNavigation(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-screen]").forEach((button) => {
    button.addEventListener("click", () => {
      state.screen = button.dataset.screen === "planner" ? "planner" : "home";
      render();
    });
  });
}

function bindPlannerForm(): void {
  const form = document.querySelector<HTMLFormElement>("#planner-form");
  if (!form) {
    return;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const goal = String(formData.get("goal") ?? "").trim();
    state.plannerGoal = goal;
    if (goal.length === 0) {
      state.errorMessage = "Enter a project prompt before running the planner.";
      render();
      return;
    }

    state.errorMessage = null;
    state.isRunningPlanner = true;
    render();

    try {
      const result = await invoke<PlannerResult>("run_planner", { goal });
      state.lastPlannerResult = result;
      state.overview = result.workspace;
      state.debugPayload = result.rawResponse;
    } catch (error) {
      state.errorMessage = normalizeError(error);
    } finally {
      state.isRunningPlanner = false;
      render();
    }
  });
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeMultiline(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br />");
}

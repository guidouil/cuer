import "beercss";
import "material-dynamic-colors";
import "./styles.css";

import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceOverview } from "../src/core/app/workspaceAppTypes.js";
import { applyOverviewState } from "./appState.js";
import { bindUi } from "./bindings.js";
import { normalizeError } from "./format.js";
import { renderApp } from "./render.js";
import { state } from "./state.js";
import { initializeSystemTheme } from "./theme.js";
import { addWorkspacePath, loadWorkspacePaths, saveWorkspacePaths } from "./workspaceRegistry.js";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

initializeSystemTheme();
void initialize();

async function initialize(): Promise<void> {
  state.workspacePaths = loadWorkspacePaths();
  state.activeWorkspacePath = state.workspacePaths[0] ?? null;
  render();
  await loadOverview();
}

export async function loadOverview(): Promise<void> {
  state.isLoadingOverview = true;
  try {
    const overview = await invoke<WorkspaceOverview>("get_workspace_overview", {
      ...(state.activeWorkspacePath ? { rootPath: state.activeWorkspacePath } : {}),
    });
    applyOverviewState(overview);
    state.workspacePaths = addWorkspacePath(state.workspacePaths, overview.workspacePath);
    saveWorkspacePaths(state.workspacePaths);
    state.debugPayload = overview;
  } catch (error) {
    if (!state.activeWorkspacePath) {
      state.errorMessage = normalizeError(error);
      return;
    }

    const failedWorkspacePath = state.activeWorkspacePath;
    state.workspacePaths = state.workspacePaths.filter((path) => path !== failedWorkspacePath);
    saveWorkspacePaths(state.workspacePaths);
    state.activeWorkspacePath = null;

    try {
      const overview = await invoke<WorkspaceOverview>("get_workspace_overview");
      applyOverviewState(overview);
      state.workspacePaths = addWorkspacePath(state.workspacePaths, overview.workspacePath);
      saveWorkspacePaths(state.workspacePaths);
      state.debugPayload = overview;
    } catch (fallbackError) {
      state.errorMessage = `${normalizeError(error)} ${normalizeError(fallbackError)}`;
    }
  } finally {
    state.isLoadingOverview = false;
    render();
  }
}

function render(): void {
  app.innerHTML = renderApp();
  bindUi(render);
}

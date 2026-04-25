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

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("App root not found.");
}

initializeSystemTheme();
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
  app.innerHTML = renderApp();
  bindUi(render);
}

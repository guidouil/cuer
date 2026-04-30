import { WorkspaceContext } from "../../core/context/workspaceContext.js";

import type { Terminal } from "../terminal.js";

export function runInitCommand(rootPath: string, terminal: Terminal): void {
  const context = WorkspaceContext.open(rootPath, { autoInitialize: true, discoverExisting: false });

  try {
    terminal.info(`Workspace ready: ${context.paths.workspaceDir}`);
    terminal.info(`Database: ${context.paths.dbPath}`);
    terminal.info("Account Manager: ready");
  } finally {
    context.close();
  }
}

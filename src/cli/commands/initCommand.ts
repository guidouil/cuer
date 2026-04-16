import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";

import type { Terminal } from "../terminal.js";

export function runInitCommand(rootPath: string, terminal: Terminal): void {
  const context = WorkspaceContext.open(rootPath, { autoInitialize: true });

  try {
    const { created, project } = context.ensureProject();

    context.repositories.events.create({
      id: createId("event"),
      projectId: project.id,
      planId: null,
      taskId: null,
      type: "workspace.initialized",
      payload: {
        createdProject: created,
        workspaceDir: context.paths.workspaceDir,
      },
      createdAt: nowIso(),
    });

    terminal.info(`Workspace ready: ${context.paths.workspaceDir}`);
    terminal.info(`Database: ${context.paths.dbPath}`);
    terminal.info(`Project: ${project.name}`);
  } finally {
    context.close();
  }
}

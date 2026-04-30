import { getProjectStatus } from "../../core/context/projectStatus.js";
import { WorkspaceContext } from "../../core/context/workspaceContext.js";
import { renderTable, renderTaskRows } from "../format.js";

import type { Terminal } from "../terminal.js";

export function runTasksCommand(rootPath: string, terminal: Terminal): void {
  const context = WorkspaceContext.open(rootPath);

  try {
    const project = context.repositories.projects.findByRootPath(context.paths.rootPath);
    if (!project) {
      terminal.info('No project registered yet. Run "cuer init" or "cuer plan" first.');
      return;
    }

    const status = getProjectStatus(context, project);
    if (!status.plan) {
      terminal.info('No plan found yet. Run "cuer plan" to create the first task graph.');
      return;
    }

    const tasksById = new Map(status.tasks.map((task) => [task.id, task]));
    const dependencyTitles = new Map<string, string[]>();

    for (const [taskId, dependencyIds] of status.dependencyMap.entries()) {
      dependencyTitles.set(
        taskId,
        dependencyIds
          .map((dependencyId) => tasksById.get(dependencyId)?.title)
          .filter((title): title is string => title !== undefined),
      );
    }

    terminal.info(`Current plan: ${status.plan.id}`);
    terminal.info(
      renderTable(
        ["STATUS", "P", "TYPE", "DEPENDS ON", "TITLE"],
        renderTaskRows(status.tasks, dependencyTitles),
      ),
    );
  } finally {
    context.close();
  }
}

import type {
  ProjectWorkGatewaySummary,
  QueueSummary,
  UsageSummaryView,
} from "../src/core/app/workspaceAppTypes.js";
import type { AuthMethodType, Task, TaskDependency } from "../src/domain/index.js";

export function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export function formatAuthMethod(authMethod: AuthMethodType): string {
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

export function formatProjectGatewayLabel(gateway: ProjectWorkGatewaySummary | null): string {
  if (!gateway) {
    return "Gateway status unavailable.";
  }

  if (gateway.isReady) {
    return `Gateway ${gateway.accountName ?? "Unknown account"} (${gateway.providerLabel ?? "Unknown provider"})`;
  }

  return gateway.reason ?? "Gateway unavailable.";
}

export function renderTotalCost(summary: UsageSummaryView): string {
  if (summary.totalCost === null) {
    if (summary.currencies.length > 1) {
      return "Multi-currency";
    }

    return "Not recorded yet";
  }

  return `${summary.totalCost.toFixed(4)} ${summary.currencies[0] ?? ""}`.trim();
}

export function queueTotal(queue: QueueSummary): number {
  return (
    queue.readyTaskIds.length
    + queue.blockedTaskIds.length
    + queue.runningTaskIds.length
    + queue.doneTaskIds.length
    + queue.failedTaskIds.length
  );
}

export function statusIcon(status: Task["status"]): string {
  switch (status) {
    case "ready":
      return "play_arrow";
    case "blocked":
      return "block";
    case "running":
      return "progress_activity";
    case "done":
      return "check";
    case "failed":
      return "error";
    case "draft":
      return "edit_note";
  }
}

export function statusTone(status: Task["status"]): string {
  switch (status) {
    case "done":
      return "green10";
    case "failed":
      return "error-container";
    case "running":
      return "secondary-container";
    case "ready":
      return "primary-container";
    case "blocked":
      return "amber10";
    case "draft":
      return "surface-container-high";
  }
}

export function dependencyLabel(task: Task, tasks: Task[], dependencies: TaskDependency[]): string {
  const tasksById = new Map(tasks.map((entry) => [entry.id, entry.title]));
  const labels = dependencies
    .filter((dependency) => dependency.taskId === task.id)
    .map((dependency) => tasksById.get(dependency.dependsOnTaskId) ?? dependency.dependsOnTaskId);

  return labels.length > 0 ? labels.join(", ") : "No dependency";
}

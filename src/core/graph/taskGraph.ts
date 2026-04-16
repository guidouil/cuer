import type { TaskDependency } from "../../domain/index.js";

export function buildDependencyMap(dependencies: TaskDependency[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const dependency of dependencies) {
    const existing = map.get(dependency.taskId) ?? [];
    existing.push(dependency.dependsOnTaskId);
    map.set(dependency.taskId, existing);
  }

  return map;
}

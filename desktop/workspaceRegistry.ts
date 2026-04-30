const STORAGE_KEY = "cuer.desktop.workspacePaths.v1";

export function loadWorkspacePaths(): string[] {
  const rawValue = window.localStorage.getItem(STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return dedupeWorkspacePaths(parsed.filter((entry): entry is string => typeof entry === "string"));
  } catch {
    return [];
  }
}

export function saveWorkspacePaths(paths: string[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dedupeWorkspacePaths(paths)));
}

export function addWorkspacePath(paths: string[], path: string): string[] {
  return dedupeWorkspacePaths([path, ...paths]);
}

export function workspaceDisplayName(path: string): string {
  const normalizedPath = path.replace(/[/\\]+$/g, "");
  return normalizedPath.split(/[/\\]/).at(-1) || normalizedPath || path;
}

function dedupeWorkspacePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const path of paths.map((entry) => entry.trim()).filter(Boolean)) {
    if (seen.has(path)) {
      continue;
    }

    seen.add(path);
    result.push(path);
  }

  return result;
}

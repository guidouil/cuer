import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

import type { Plan, Task, TaskDependency, TaskExecutionResultArtifact } from "../domain/index.js";

import { normalizeWorkspaceConfig, type WorkspaceConfig } from "./config.js";

export interface WorkspacePaths {
  rootPath: string;
  workspaceDir: string;
  dbPath: string;
  configPath: string;
  plansDir: string;
  artifactsDir: string;
  logsDir: string;
  promptsDir: string;
  skillsDir: string;
}

export interface ResolveWorkspacePathsForOpenOptions {
  autoInitialize?: boolean;
  discoverExisting?: boolean;
}

export interface ClearedWorkflowFiles {
  removedExecutionArtifactCount: number;
  removedPlanSnapshotCount: number;
  removedPromptCount: number;
}

export function resolveWorkspacePaths(rootPath: string): WorkspacePaths {
  const resolvedRootPath = resolve(rootPath);
  const workspaceDir = join(resolvedRootPath, ".cuer");

  return {
    rootPath: resolvedRootPath,
    workspaceDir,
    dbPath: join(workspaceDir, "cuer.db"),
    configPath: join(workspaceDir, "config.json"),
    plansDir: join(workspaceDir, "plans"),
    artifactsDir: join(workspaceDir, "artifacts"),
    logsDir: join(workspaceDir, "logs"),
    promptsDir: join(workspaceDir, "prompts"),
    skillsDir: join(workspaceDir, "skills"),
  };
}

export function resolveWorkspacePathsForOpen(
  rootPath: string,
  options: ResolveWorkspacePathsForOpenOptions = {},
): WorkspacePaths {
  if (options.discoverExisting !== false) {
    const existingPaths = findNearestWorkspacePaths(rootPath);
    if (existingPaths) {
      return existingPaths;
    }
  }

  return resolveWorkspacePaths(rootPath);
}

export function findNearestWorkspacePaths(startPath: string): WorkspacePaths | null {
  let currentPath = resolve(startPath);

  while (true) {
    const paths = resolveWorkspacePaths(currentPath);
    if (workspaceExists(paths)) {
      return paths;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }

    currentPath = parentPath;
  }
}

export function workspaceExists(paths: WorkspacePaths): boolean {
  return existsSync(paths.workspaceDir);
}

export function ensureWorkspaceDirectories(paths: WorkspacePaths): void {
  mkdirSync(paths.workspaceDir, { recursive: true });
  mkdirSync(paths.plansDir, { recursive: true });
  mkdirSync(paths.artifactsDir, { recursive: true });
  mkdirSync(paths.logsDir, { recursive: true });
  mkdirSync(paths.promptsDir, { recursive: true });
  mkdirSync(paths.skillsDir, { recursive: true });
}

export function readWorkspaceConfig(paths: WorkspacePaths): WorkspaceConfig | null {
  if (!existsSync(paths.configPath)) {
    return null;
  }

  const raw = readFileSync(paths.configPath, "utf8");
  return normalizeWorkspaceConfig(JSON.parse(raw) as Partial<WorkspaceConfig>, {
    projectName: inferProjectName(paths.rootPath),
    projectRoot: paths.rootPath,
    createdAt: new Date(0).toISOString(),
  });
}

export function writeWorkspaceConfig(paths: WorkspacePaths, config: WorkspaceConfig): void {
  writeFileSync(paths.configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function inferProjectName(rootPath: string): string {
  return basename(rootPath);
}

export function writePlanSnapshot(
  paths: WorkspacePaths,
  payload: {
    plan: Plan;
    tasks: Task[];
    dependencies: TaskDependency[];
  },
): void {
  const filePath = join(paths.plansDir, `${payload.plan.id}.json`);
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function clearWorkflowFiles(paths: WorkspacePaths): ClearedWorkflowFiles {
  return {
    removedExecutionArtifactCount: resetDirectory(join(paths.artifactsDir, "execution-results")),
    removedPlanSnapshotCount: resetDirectory(paths.plansDir),
    removedPromptCount: resetDirectory(paths.promptsDir),
  };
}

export function writeRunnerPrompt(
  paths: WorkspacePaths,
  payload: {
    taskId: string;
    taskTitle: string;
    content: string;
  },
): string {
  const safeTitle = payload.taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  const filePath = join(paths.promptsDir, `${payload.taskId}-${safeTitle || "task"}.md`);
  writeFileSync(filePath, payload.content, "utf8");
  return filePath;
}

export function writeExecutionResultArtifact(
  paths: WorkspacePaths,
  payload: {
    artifact: TaskExecutionResultArtifact;
  },
): string {
  const executionResultsDir = join(paths.artifactsDir, "execution-results");
  mkdirSync(executionResultsDir, { recursive: true });

  const safeTitle = payload.artifact.taskTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 48);
  const timestamp = payload.artifact.createdAt.replace(/[:.]/g, "-");
  const filePath = join(
    executionResultsDir,
    `${timestamp}-${payload.artifact.taskId}-${safeTitle || "task"}.json`,
  );

  writeFileSync(filePath, `${JSON.stringify(payload.artifact, null, 2)}\n`, "utf8");
  return filePath;
}

export function readExecutionResultArtifact(filePath: string): TaskExecutionResultArtifact {
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as TaskExecutionResultArtifact;
}

export function executionResultArtifactExists(filePath: string): boolean {
  return existsSync(filePath);
}

export function readTextFileIfExists(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, "utf8");
}

export function readTextFile(filePath: string): string {
  return readFileSync(filePath, "utf8");
}

function resetDirectory(directoryPath: string): number {
  const removedFileCount = countFiles(directoryPath);
  rmSync(directoryPath, { force: true, recursive: true });
  mkdirSync(directoryPath, { recursive: true });
  return removedFileCount;
}

function countFiles(directoryPath: string): number {
  if (!existsSync(directoryPath)) {
    return 0;
  }

  let count = 0;

  for (const entry of readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      count += countFiles(entryPath);
      continue;
    }

    if (entry.isFile()) {
      count += 1;
    }
  }

  return count;
}

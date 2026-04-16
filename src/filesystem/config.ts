export interface WorkspaceConfig {
  schemaVersion: number;
  projectName: string;
  projectRoot: string;
  defaultPlanner: string;
  defaultRunner: string;
  createdAt: string;
  updatedAt: string;
}

export function createWorkspaceConfig(input: {
  projectName: string;
  projectRoot: string;
  createdAt: string;
}): WorkspaceConfig {
  return {
    schemaVersion: 1,
    projectName: input.projectName,
    projectRoot: input.projectRoot,
    defaultPlanner: "simple-v0",
    defaultRunner: "manual-external-v0",
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function normalizeWorkspaceConfig(
  value: Partial<WorkspaceConfig>,
  input: {
    projectName: string;
    projectRoot: string;
    createdAt: string;
  },
): WorkspaceConfig {
  return {
    schemaVersion: value.schemaVersion ?? 1,
    projectName: value.projectName ?? input.projectName,
    projectRoot: value.projectRoot ?? input.projectRoot,
    defaultPlanner: value.defaultPlanner ?? "simple-v0",
    defaultRunner: value.defaultRunner ?? "manual-external-v0",
    createdAt: value.createdAt ?? input.createdAt,
    updatedAt: value.updatedAt ?? input.createdAt,
  };
}

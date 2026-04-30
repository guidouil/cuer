import type { SecretStore } from "../accounts/secretStore.js";
import type { Project } from "../../domain/index.js";
import { CuerDatabase } from "../../db/database.js";
import { createRepositories, type RepositorySet } from "../../db/repositories/index.js";
import { createWorkspaceConfig, normalizeWorkspaceConfig } from "../../filesystem/config.js";
import { createSecretStore } from "../../integrations/secrets/osKeychainSecretStore.js";
import {
  ensureWorkspaceDirectories,
  inferProjectName,
  readWorkspaceConfig,
  resolveWorkspacePathsForOpen,
  type WorkspacePaths,
  workspaceExists,
  writeWorkspaceConfig,
} from "../../filesystem/workspace.js";
import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";

import type { WorkspaceConfig } from "../../filesystem/config.js";

export interface EnsureProjectResult {
  created: boolean;
  project: Project;
}

export interface OpenWorkspaceOptions {
  autoInitialize?: boolean;
  discoverExisting?: boolean;
}

export class WorkspaceContext {
  readonly repositories: RepositorySet;

  private constructor(
    readonly paths: WorkspacePaths,
    readonly config: WorkspaceConfig,
    readonly database: CuerDatabase,
    readonly secretStore: SecretStore,
  ) {
    this.repositories = createRepositories(database.connection);
  }

  static open(rootPath: string, options: OpenWorkspaceOptions = {}): WorkspaceContext {
    const paths = resolveWorkspacePathsForOpen(rootPath, options);
    const present = workspaceExists(paths);

    if (!present && !options.autoInitialize) {
      throw new Error(`No Cuer workspace found from ${rootPath}. Run "cuer init [project-dir]" first.`);
    }

    ensureWorkspaceDirectories(paths);

    let config = readWorkspaceConfig(paths);
    if (!config) {
      const createdAt = nowIso();
      config = createWorkspaceConfig({
        projectName: inferProjectName(rootPath),
        projectRoot: rootPath,
        createdAt,
      });
      writeWorkspaceConfig(paths, config);
    } else {
      const normalizedConfig = normalizeWorkspaceConfig(config, {
        projectName: inferProjectName(rootPath),
        projectRoot: rootPath,
        createdAt: config.createdAt,
      });
      config = normalizedConfig;
      writeWorkspaceConfig(paths, normalizedConfig);
    }

    const database = new CuerDatabase(paths.dbPath);
    const secretStore = createSecretStore();
    return new WorkspaceContext(paths, config, database, secretStore);
  }

  close(): void {
    this.database.close();
  }

  ensureProject(): EnsureProjectResult {
    const existing = this.repositories.projects.findByRootPath(this.paths.rootPath);
    if (existing) {
      return {
        created: false,
        project: existing,
      };
    }

    const timestamp = nowIso();
    const project: Project = {
      id: createId("project"),
      name: this.config.projectName,
      rootPath: this.paths.rootPath,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    this.repositories.projects.create(project);

    return {
      created: true,
      project,
    };
  }
}

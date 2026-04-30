import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { runInitCommand } from "../src/cli/commands/initCommand.js";
import { WorkspaceAppService } from "../src/core/app/workspaceAppService.js";
import { WorkspaceContext } from "../src/core/context/workspaceContext.js";

import type { Terminal } from "../src/cli/terminal.js";

test("workspace context recovers an existing parent .cuer from a project subdirectory", async (t) => {
  const projectRoot = await createTempDir(t);
  const nestedPath = join(projectRoot, "src", "feature");
  await mkdir(nestedPath, { recursive: true });

  const initialized = WorkspaceContext.open(projectRoot, { autoInitialize: true });
  initialized.close();

  const context = WorkspaceContext.open(nestedPath);
  try {
    assert.equal(context.paths.rootPath, projectRoot);
    assert.equal(context.paths.workspaceDir, join(projectRoot, ".cuer"));

    const { project } = context.ensureProject();
    assert.equal(project.rootPath, projectRoot);
  } finally {
    context.close();
  }
});

test("workspace app overview recovers an existing parent .cuer from a project subdirectory", async (t) => {
  const projectRoot = await createTempDir(t);
  const nestedPath = join(projectRoot, "packages", "cli");
  await mkdir(nestedPath, { recursive: true });

  const context = WorkspaceContext.open(projectRoot, { autoInitialize: true });
  context.ensureProject();
  context.close();

  const overview = new WorkspaceAppService().tryGetWorkspaceOverview(nestedPath);
  assert.ok(overview);
  assert.equal(overview.workspacePath, projectRoot);
  assert.equal(overview.projects[0]?.project.rootPath, projectRoot);
});

test("workspace app initialization creates a .cuer in the requested project directory", async (t) => {
  const parentRoot = await createTempDir(t);
  const childRoot = join(parentRoot, "child-project");
  await mkdir(childRoot, { recursive: true });

  const parentContext = WorkspaceContext.open(parentRoot, { autoInitialize: true });
  parentContext.close();

  const overview = new WorkspaceAppService().initializeWorkspace(childRoot);

  assert.equal(overview.workspacePath, childRoot);
  assert.equal(existsSync(join(childRoot, ".cuer", "config.json")), true);
});

test("init command creates .cuer in the requested project directory", async (t) => {
  const tempRoot = await createTempDir(t);
  const projectRoot = join(tempRoot, "project-a");
  await mkdir(projectRoot, { recursive: true });

  const terminal = new RecordingTerminal();
  runInitCommand(projectRoot, terminal);

  assert.equal(existsSync(join(projectRoot, ".cuer", "config.json")), true);
  assert.equal(existsSync(join(tempRoot, ".cuer")), false);
  assert.match(terminal.infos[0] ?? "", /^Workspace ready: /);
});

class RecordingTerminal implements Terminal {
  readonly errors: string[] = [];
  readonly infos: string[] = [];

  error(message: string): void {
    this.errors.push(message);
  }

  info(message: string): void {
    this.infos.push(message);
  }

  async prompt(_message: string): Promise<string> {
    throw new Error("Init command should not prompt.");
  }
}

async function createTempDir(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cuer-workspace-test-"));
  t.after(async () => {
    await rm(directory, { force: true, recursive: true });
  });
  return directory;
}

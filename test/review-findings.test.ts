import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { runAccountsCommand } from "../src/cli/commands/accountsCommand.js";
import { AccountManagerService } from "../src/core/accounts/accountManagerService.js";
import { WorkspaceAppService } from "../src/core/app/workspaceAppService.js";
import { WorkspaceContext } from "../src/core/context/workspaceContext.js";

import type { Terminal } from "../src/cli/terminal.js";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

test("desktop shell does not depend on a checkout-local Node bridge", async () => {
  const tauriConfigPath = repoPath("src-tauri/tauri.conf.json");
  const tauriRuntimePath = repoPath("src-tauri/src/lib.rs");
  const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8")) as {
    build?: {
      frontendDist?: string;
    };
  };
  const tauriRuntime = await readFile(tauriRuntimePath, "utf8");

  assert.doesNotMatch(
    tauriRuntime,
    /join\("dist\/desktop\/bridgeCli\.js"\)/,
    `frontendDist is ${tauriConfig.build?.frontendDist ?? "unset"}; runtime should not resolve dist/desktop/bridgeCli.js from the source checkout.`,
  );
  assert.doesNotMatch(
    tauriRuntime,
    /Command::new\(node_binary\)/,
    "The packaged desktop runtime should not require a system Node binary to answer frontend invokes.",
  );
});

test("pending credentials do not unlock the planning gateway", async (t) => {
  const rootPath = await createTempDir(t);
  const workspaceAppService = new WorkspaceAppService();
  const accountManager = new AccountManagerService();

  const result = workspaceAppService.createProviderAccount({
    authMethodType: "oauth",
    name: "Pending OpenAI OAuth",
    providerType: "openai",
    rootPath,
  });

  assert.equal(result.account.credentialStatus, "pending");
  assert.equal(
    result.workspace.accountManager.projectWorkGateway.isReady,
    false,
    "A pending credential should not be advertised as a ready planning gateway.",
  );

  const context = WorkspaceContext.open(rootPath);
  t.after(() => {
    context.close();
  });

  assert.throws(
    () => accountManager.requireCapability(context, "planning"),
    /No provider account is ready for project planning/i,
  );
});

test("local endpoint accounts remain ready without a stored secret", async (t) => {
  const rootPath = await createTempDir(t);
  const workspaceAppService = new WorkspaceAppService();

  const result = workspaceAppService.createProviderAccount({
    authMethodType: "local_endpoint",
    baseUrl: "http://localhost:11434/v1",
    name: "Local Ollama",
    providerType: "ollama",
    rootPath,
  });

  assert.equal(result.account.credentialStatus, "configured");
  assert.equal(result.account.canPlan, true);
  assert.equal(result.account.canExecute, true);
  assert.equal(result.workspace.accountManager.projectWorkGateway.isReady, true);
});

test("accounts command does not initialize a missing workspace", async (t) => {
  const rootPath = await createTempDir(t);
  const terminal = new RecordingTerminal();

  assert.doesNotThrow(() => {
    runAccountsCommand(rootPath, terminal);
  });
  assert.equal(
    existsSync(join(rootPath, ".cuer")),
    false,
    "Listing accounts should not create .cuer/ side effects in a virgin directory.",
  );
});

test("desktop frontend does not redeclare shared app-service DTOs", async () => {
  const workspaceAppServiceContracts = getExportedTypeNames(
    await readFile(repoPath("src/core/app/workspaceAppService.ts"), "utf8"),
    repoPath("src/core/app/workspaceAppService.ts"),
  );
  const desktopContracts = getDeclaredTypeNames(
    await readDesktopSources(["desktop/main.ts", "desktop/types.ts"]),
    "desktop UI sources",
  );
  const duplicates = [...desktopContracts]
    .filter((name) => workspaceAppServiceContracts.has(name))
    .sort((left, right) => left.localeCompare(right));

  assert.deepEqual(
    duplicates,
    [],
    `desktop/main.ts redeclares shared contracts instead of importing them: ${duplicates.join(", ")}`,
  );
});

test("desktop frontend exposes an explicit resume action for pending planner inquiries", async () => {
  const desktopSource = await readDesktopSources(["desktop/render.ts", "desktop/bindings.ts"]);

  assert.match(desktopSource, /data-action="resume-pending"/);
  assert.match(desktopSource, /Resume planner/);
  assert.match(desktopSource, /Planner waiting/);
  assert.match(desktopSource, /Import planner response JSON/);
  assert.match(desktopSource, /planner-response-file/);
});

test("desktop frontend follows the operating system color scheme", async () => {
  const desktopSource = await readDesktopSources(["desktop/main.ts", "desktop/theme.ts", "desktop/index.html"]);

  assert.match(desktopSource, /prefers-color-scheme: dark/);
  assert.match(desktopSource, /classList\.toggle\("dark"/);
  assert.match(desktopSource, /classList\.toggle\("light"/);
  assert.match(desktopSource, /initializeSystemTheme/);
  assert.doesNotMatch(desktopSource, /<body class="light">/);
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
    throw new Error("Prompt not expected in this test.");
  }
}

async function createTempDir(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cuer-test-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function repoPath(relativePath: string): string {
  return join(REPO_ROOT, relativePath);
}

async function readDesktopSources(relativePaths: string[]): Promise<string> {
  return (await Promise.all(relativePaths.map((relativePath) => readFile(repoPath(relativePath), "utf8")))).join("\n");
}

function getDeclaredTypeNames(sourceText: string, filePath: string): Set<string> {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      names.add(statement.name.text);
    }
  }

  return names;
}

function getExportedTypeNames(sourceText: string, filePath: string): Set<string> {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const names = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!(ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))) {
      continue;
    }

    const isExported =
      statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;

    if (isExported) {
      names.add(statement.name.text);
    }
  }

  return names;
}

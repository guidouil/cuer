import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AccountManagerService } from "../src/core/accounts/accountManagerService.js";
import type { SecretPayload, SecretStore } from "../src/core/accounts/secretStore.js";
import type { WorkspaceContext } from "../src/core/context/workspaceContext.js";
import { CuerDatabase } from "../src/db/database.js";
import { createRepositories } from "../src/db/repositories/index.js";

const REPO_ROOT = fileURLToPath(new URL("../", import.meta.url));

test("deleting a provider account removes its stored secret and cascaded records", () => {
  const database = new CuerDatabase(":memory:");
  const repositories = createRepositories(database.connection);
  const secretStore = createInMemorySecretStore();
  const context = {
    database,
    repositories,
    secretStore,
  } as unknown as WorkspaceContext;
  const service = new AccountManagerService();

  try {
    const created = service.registerProviderAccount(context, {
      authMethodType: "oauth",
      name: "Primary OpenAI OAuth",
      providerType: "openai",
      secretPayload: {
        accessToken: "access-token-123",
        refreshToken: "refresh-token-123",
        tokenType: "Bearer",
      },
      secretHint: "OAuth connected",
    });

    assert.equal(repositories.accounts.findById(created.account.id)?.name, "Primary OpenAI OAuth");
    assert.equal(secretStore.deletedRefs.length, 0);

    service.deleteProviderAccount(context, created.account.id);

    assert.equal(repositories.accounts.findById(created.account.id), null);
    assert.equal(repositories.authMethods.findByAccountId(created.account.id), null);
    assert.equal(repositories.credentials.findByAccountId(created.account.id), null);
    assert.equal(secretStore.deletedRefs.length, 1);
  } finally {
    database.close();
  }
});

test("desktop frontend exposes a delete action for saved provider configurations", async () => {
  const desktopSource = await readDesktopSources(["desktop/render.ts", "desktop/bindings.ts"]);

  assert.match(desktopSource, /prompt-delete-account/);
  assert.match(desktopSource, /confirm-delete-account/);
  assert.match(desktopSource, /delete_provider_account/);
  assert.match(desktopSource, /role="dialog"/);
  assert.match(desktopSource, /<i>delete<\/i>/);
});

interface InMemorySecretStore extends SecretStore {
  deletedRefs: string[];
}

function createInMemorySecretStore(): InMemorySecretStore {
  const secrets = new Map<string, SecretPayload>();
  const deletedRefs: string[] = [];

  return {
    deletedRefs,
    delete(secretRef: string): void {
      deletedRefs.push(secretRef);
      secrets.delete(secretRef);
    },
    get(secretRef: string): SecretPayload | null {
      return secrets.get(secretRef) ?? null;
    },
    put(secretRef: string, payload: SecretPayload): void {
      secrets.set(secretRef, payload);
    },
  };
}

function repoPath(relativePath: string): string {
  return join(REPO_ROOT, relativePath);
}

async function readDesktopSources(relativePaths: string[]): Promise<string> {
  return (await Promise.all(relativePaths.map((relativePath) => readFile(repoPath(relativePath), "utf8")))).join("\n");
}

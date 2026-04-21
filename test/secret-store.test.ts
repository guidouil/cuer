import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import type { SecretPayload, SecretStore } from "../src/core/accounts/secretStore.js";
import { FilesystemSecretStore } from "../src/filesystem/secretStore.js";
import {
  LinuxSecretServiceSecretStore,
  MacOsKeychainSecretStore,
  MigratingSecretStore,
  type CommandInvocation,
  type CommandResult,
  type CommandRunner,
} from "../src/integrations/secrets/osKeychainSecretStore.js";

test("macOS keychain secret store persists payloads through the security CLI contract", () => {
  const store = new MacOsKeychainSecretStore(createMacOsRunner());
  const payload = { apiKey: "sk-test-1234" };

  store.put("secret_primary", payload);
  assert.deepEqual(store.get("secret_primary"), payload);

  store.delete("secret_primary");
  assert.equal(store.get("secret_primary"), null);
});

test("Linux secret service store persists payloads through the secret-tool contract", () => {
  const store = new LinuxSecretServiceSecretStore(createLinuxRunner());
  const payload = { accessToken: "token-1234" };

  store.put("secret_primary", payload);
  assert.deepEqual(store.get("secret_primary"), payload);

  store.delete("secret_primary");
  assert.equal(store.get("secret_primary"), null);
});

test("migrating secret store upgrades legacy filesystem secrets after a successful read", async (t) => {
  const secretsDir = await createTempDir(t);
  const legacy = new FilesystemSecretStore(secretsDir);
  const primary = new InMemorySecretStore();
  const store = new MigratingSecretStore(primary, legacy);
  const payload = { apiKey: "sk-legacy-1234" };
  const secretRef = "secret_legacy";

  legacy.put(secretRef, payload);

  assert.deepEqual(store.get(secretRef), payload);
  assert.deepEqual(primary.get(secretRef), payload);
  assert.equal(existsSync(join(secretsDir, `${secretRef}.json`)), false);
});

test("migrating secret store still reads legacy secrets when the primary backend is unavailable", async (t) => {
  const secretsDir = await createTempDir(t);
  const legacy = new FilesystemSecretStore(secretsDir);
  const store = new MigratingSecretStore(new UnavailableSecretStore(), legacy);
  const payload = { apiKey: "sk-legacy-1234" };

  legacy.put("secret_legacy", payload);

  assert.deepEqual(store.get("secret_legacy"), payload);
});

class InMemorySecretStore implements SecretStore {
  private readonly values = new Map<string, SecretPayload>();

  put(secretRef: string, payload: SecretPayload): void {
    this.values.set(secretRef, payload);
  }

  get(secretRef: string): SecretPayload | null {
    return this.values.get(secretRef) ?? null;
  }

  delete(secretRef: string): void {
    this.values.delete(secretRef);
  }
}

class UnavailableSecretStore implements SecretStore {
  put(): void {
    throw new Error("OS keychain unavailable");
  }

  get(): SecretPayload | null {
    throw new Error("OS keychain unavailable");
  }

  delete(): void {
    throw new Error("OS keychain unavailable");
  }
}

async function createTempDir(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cuer-secrets-test-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function createMacOsRunner(): CommandRunner {
  const secrets = new Map<string, string>();

  return (invocation) => {
    assert.equal(invocation.command, "security");

    const subcommand = invocation.args[0];
    const account = readFlagValue(invocation, "-a");
    const service = readFlagValue(invocation, "-s");
    const key = `${service}:${account}`;

    switch (subcommand) {
      case "add-generic-password": {
        const password = readFlagValue(invocation, "-w");
        secrets.set(key, password);
        return success();
      }
      case "find-generic-password": {
        const password = secrets.get(key);
        if (!password) {
          return {
            error: undefined,
            status: 44,
            stderr: "The specified item could not be found in the keychain.",
            stdout: "",
          };
        }

        return success(password);
      }
      case "delete-generic-password": {
        secrets.delete(key);
        return success();
      }
      default:
        throw new Error(`Unexpected macOS keychain command: ${subcommand ?? "missing"}`);
    }
  };
}

function createLinuxRunner(): CommandRunner {
  const secrets = new Map<string, string>();

  return (invocation) => {
    assert.equal(invocation.command, "secret-tool");

    const subcommand = invocation.args[0];
    const key = readLinuxLookupKey(invocation);

    switch (subcommand) {
      case "store":
        secrets.set(key, invocation.input ?? "");
        return success();
      case "lookup": {
        const payload = secrets.get(key);
        if (!payload) {
          return {
            error: undefined,
            status: 1,
            stderr: "",
            stdout: "",
          };
        }

        return success(payload);
      }
      case "clear":
        secrets.delete(key);
        return success();
      default:
        throw new Error(`Unexpected Linux secret store command: ${subcommand ?? "missing"}`);
    }
  };
}

function readFlagValue(invocation: CommandInvocation, flag: string): string {
  const index = invocation.args.indexOf(flag);
  if (index === -1 || index + 1 >= invocation.args.length) {
    throw new Error(`Flag "${flag}" is missing from command invocation.`);
  }

  return invocation.args[index + 1] ?? "";
}

function readLinuxLookupKey(invocation: CommandInvocation): string {
  const attrs = invocation.args.slice(invocation.args[0] === "store" ? 3 : 1);
  const pairs: string[] = [];

  for (let index = 0; index < attrs.length; index += 2) {
    const attribute = attrs[index];
    const value = attrs[index + 1];
    if (!attribute || value === undefined) {
      continue;
    }

    pairs.push(`${attribute}:${value}`);
  }

  return pairs.join("|");
}

function success(stdout = ""): CommandResult {
  return {
    error: undefined,
    status: 0,
    stderr: "",
    stdout,
  };
}

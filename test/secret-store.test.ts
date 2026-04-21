import assert from "node:assert/strict";
import test from "node:test";

import {
  LinuxSecretServiceSecretStore,
  MacOsKeychainSecretStore,
  createSecretStore,
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

test("secret store creation fails fast on unsupported platforms", () => {
  assert.throws(
    () => createSecretStore({ platform: "win32" }),
    /only supported on macOS and Linux/i,
  );
});

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

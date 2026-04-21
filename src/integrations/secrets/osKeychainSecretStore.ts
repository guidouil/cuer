import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { platform as runtimePlatform } from "node:os";

import type { SecretPayload, SecretStore } from "../../core/accounts/secretStore.js";

const KEYCHAIN_SERVICE_NAME = "cuer";

export interface CommandInvocation {
  args: string[];
  command: string;
  input?: string;
}

export interface CommandResult {
  error: NodeJS.ErrnoException | undefined;
  status: number | null;
  stderr: string;
  stdout: string;
}

export type CommandRunner = (invocation: CommandInvocation) => CommandResult;

export interface CreateSecretStoreOptions {
  commandRunner?: CommandRunner;
  platform?: NodeJS.Platform;
}

export function createSecretStore(options: CreateSecretStoreOptions = {}): SecretStore {
  const platform = options.platform ?? runtimePlatform();
  switch (platform) {
    case "darwin":
      return new MacOsKeychainSecretStore(options.commandRunner);
    case "linux":
      return new LinuxSecretServiceSecretStore(options.commandRunner);
    default:
      throw new Error(`Secret storage is only supported on macOS and Linux. Current platform: "${platform}".`);
  }
}

export class MacOsKeychainSecretStore implements SecretStore {
  private readonly commandRunner: CommandRunner;

  constructor(commandRunner: CommandRunner = runCommand) {
    this.commandRunner = commandRunner;
  }

  put(secretRef: string, payload: SecretPayload): void {
    const result = this.commandRunner({
      command: "security",
      args: [
        "add-generic-password",
        "-U",
        "-a",
        secretRef,
        "-s",
        KEYCHAIN_SERVICE_NAME,
        "-l",
        buildSecretLabel(secretRef),
        "-w",
        serializeSecretPayload(payload),
      ],
    });

    if (result.status === 0) {
      return;
    }

    throw buildCommandError("macOS Keychain", "store", result);
  }

  get(secretRef: string): SecretPayload | null {
    const result = this.commandRunner({
      command: "security",
      args: ["find-generic-password", "-a", secretRef, "-s", KEYCHAIN_SERVICE_NAME, "-w"],
    });

    if (result.status === 0) {
      return parseSecretPayload(result.stdout);
    }

    if (isMacOsSecretMiss(result)) {
      return null;
    }

    throw buildCommandError("macOS Keychain", "read", result);
  }

  delete(secretRef: string): void {
    const result = this.commandRunner({
      command: "security",
      args: ["delete-generic-password", "-a", secretRef, "-s", KEYCHAIN_SERVICE_NAME],
    });

    if (result.status === 0 || isMacOsSecretMiss(result)) {
      return;
    }

    throw buildCommandError("macOS Keychain", "delete", result);
  }
}

export class LinuxSecretServiceSecretStore implements SecretStore {
  private readonly commandRunner: CommandRunner;

  constructor(commandRunner: CommandRunner = runCommand) {
    this.commandRunner = commandRunner;
  }

  put(secretRef: string, payload: SecretPayload): void {
    const result = this.commandRunner({
      command: "secret-tool",
      args: ["store", "--label", buildSecretLabel(secretRef), "application", KEYCHAIN_SERVICE_NAME, "secret_ref", secretRef],
      input: serializeSecretPayload(payload),
    });

    if (result.status === 0) {
      return;
    }

    throw buildCommandError("Linux Secret Service", "store", result);
  }

  get(secretRef: string): SecretPayload | null {
    const result = this.commandRunner({
      command: "secret-tool",
      args: ["lookup", "application", KEYCHAIN_SERVICE_NAME, "secret_ref", secretRef],
    });

    if (result.status === 0) {
      return parseSecretPayload(result.stdout);
    }

    if (isLinuxSecretMiss(result)) {
      return null;
    }

    throw buildCommandError("Linux Secret Service", "read", result);
  }

  delete(secretRef: string): void {
    const result = this.commandRunner({
      command: "secret-tool",
      args: ["clear", "application", KEYCHAIN_SERVICE_NAME, "secret_ref", secretRef],
    });

    if (result.status === 0 || isLinuxSecretMiss(result)) {
      return;
    }

    throw buildCommandError("Linux Secret Service", "delete", result);
  }
}

function runCommand(invocation: CommandInvocation): CommandResult {
  const result = spawnSync(invocation.command, invocation.args, {
    encoding: "utf8",
    input: invocation.input,
  }) as SpawnSyncReturns<string>;

  return {
    error: result.error,
    status: result.status,
    stderr: result.stderr ?? "",
    stdout: result.stdout ?? "",
  };
}

function buildSecretLabel(secretRef: string): string {
  return `Cuer secret ${secretRef}`;
}

function serializeSecretPayload(payload: SecretPayload): string {
  return JSON.stringify(payload);
}

function parseSecretPayload(raw: string): SecretPayload {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Stored secret payload is not valid JSON: ${toError(error).message}`);
  }

  if (!isSecretPayload(parsed)) {
    throw new Error("Stored secret payload has an invalid shape.");
  }

  return parsed;
}

function isSecretPayload(value: unknown): value is SecretPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function isMacOsSecretMiss(result: CommandResult): boolean {
  if (result.error) {
    return false;
  }

  const stderr = result.stderr.toLowerCase();
  return result.status === 44 || stderr.includes("could not be found in the keychain");
}

function isLinuxSecretMiss(result: CommandResult): boolean {
  if (result.error) {
    return false;
  }

  return result.status === 1 && result.stderr.trim().length === 0;
}

function buildCommandError(storeName: string, operation: string, result: CommandResult): Error {
  if (result.error?.code === "ENOENT") {
    const binary = result.error.path ?? "required system command";
    return new Error(`${storeName} is unavailable because "${binary}" is not installed or not on PATH.`);
  }

  const details = result.stderr.trim() || result.stdout.trim() || `exit status ${result.status ?? "unknown"}`;
  return new Error(`Failed to ${operation} secret in ${storeName}: ${details}`);
}

function toError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(String(error));
}

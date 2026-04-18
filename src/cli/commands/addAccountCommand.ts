import { env } from "node:process";

import { WorkspaceAppService } from "../../core/app/workspaceAppService.js";
import { readOptionValue } from "../arguments.js";

import type { AuthMethodType, ProviderType } from "../../domain/index.js";
import type { ProviderCatalogItem } from "../../core/app/workspaceAppService.js";
import type { Terminal } from "../terminal.js";

const workspaceAppService = new WorkspaceAppService();

export async function runAddAccountCommand(rootPath: string, args: string[], terminal: Terminal): Promise<void> {
  const providers = workspaceAppService.getWorkspaceOverview(rootPath).accountManager.providers;
  const providerType = await resolveProviderType(args, providers, terminal);
  const provider = providers.find((candidate) => candidate.type === providerType);

  if (!provider) {
    throw new Error(`Unknown provider type "${providerType}".`);
  }

  const authMethodType = await resolveAuthMethodType(args, provider, terminal);
  const name = await resolveRequiredText(args, ["--name"], terminal, "Account name: ");
  const baseUrl = readOptionValue(args, ["--base-url"]);
  const defaultModel = readOptionValue(args, ["--model", "--default-model"]);
  const secretValue = await resolveSecret(args, authMethodType, terminal);

  const result = workspaceAppService.createProviderAccount({
    authMethodType,
    name,
    providerType,
    rootPath,
    ...(baseUrl ? { baseUrl } : {}),
    ...(defaultModel ? { defaultModel } : {}),
    ...(secretValue ? { secretValue } : {}),
  });

  terminal.info(`Account added: ${result.account.name}`);
  terminal.info(`Provider: ${result.account.providerLabel}`);
  terminal.info(`Auth: ${result.account.authMethodType ?? "unconfigured"}`);
  terminal.info(`Credential: ${result.account.credentialStatus}${result.account.secretHint ? ` ${result.account.secretHint}` : ""}`);
}

async function resolveProviderType(
  args: string[],
  providers: ProviderCatalogItem[],
  terminal: Terminal,
): Promise<ProviderType> {
  const provided = readOptionValue(args, ["--provider"]);
  if (provided) {
    return provided as ProviderType;
  }

  const choices = providers.map((provider) => provider.type).join(", ");
  const value = (await terminal.prompt(`Provider type (${choices}): `)).trim();
  return value as ProviderType;
}

async function resolveAuthMethodType(
  args: string[],
  provider: ProviderCatalogItem,
  terminal: Terminal,
): Promise<AuthMethodType> {
  const provided = readOptionValue(args, ["--auth", "--auth-method"]);
  if (provided) {
    return provided as AuthMethodType;
  }

  const choices = provider.supportedAuthMethods.join(", ");
  const value = (await terminal.prompt(`Auth method (${choices}): `)).trim();
  return value as AuthMethodType;
}

async function resolveRequiredText(
  args: string[],
  names: string[],
  terminal: Terminal,
  promptMessage: string,
): Promise<string> {
  const provided = readOptionValue(args, names)?.trim();
  if (provided) {
    return provided;
  }

  const prompted = (await terminal.prompt(promptMessage)).trim();
  if (prompted.length === 0) {
    throw new Error("A value is required.");
  }

  return prompted;
}

async function resolveSecret(
  args: string[],
  authMethodType: AuthMethodType,
  terminal: Terminal,
): Promise<string | undefined> {
  const inlineSecret = readOptionValue(args, ["--secret"])?.trim();
  if (inlineSecret) {
    return inlineSecret;
  }

  const envName = readOptionValue(args, ["--secret-env"])?.trim();
  if (envName) {
    const envValue = env[envName]?.trim();
    if (!envValue) {
      throw new Error(`Environment variable "${envName}" is not set.`);
    }

    return envValue;
  }

  const promptLabel = authMethodType === "api_key" ? "API key" : "Credential or placeholder auth data";
  const prompted = (await terminal.prompt(`${promptLabel} (leave blank to configure later): `)).trim();
  return prompted.length > 0 ? prompted : undefined;
}

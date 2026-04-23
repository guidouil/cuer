import { createId } from "../../utils/id.js";
import { nowIso } from "../../utils/time.js";

import { PROVIDER_CATALOG } from "./providerCatalog.js";

import type { SecretPayload } from "./secretStore.js";
import type {
  AccessCapability,
  AccessPolicy,
  Account,
  AuthMethod,
  AuthMethodType,
  CostRecord,
  Credential,
  Provider,
  ProviderType,
  UsageEvent,
} from "../../domain/index.js";
import type { WorkspaceContext } from "../context/workspaceContext.js";

export interface RegisterProviderAccountInput {
  authMethodType: AuthMethodType;
  authMethodConfig?: Account["config"];
  baseUrl?: string | null;
  credentialMetadata?: Credential["metadata"];
  defaultModel?: string | null;
  name: string;
  providerType: ProviderType;
  secretHint?: string | null;
  secretPayload?: SecretPayload | null;
  secretValue?: string | null;
}

export interface AccountRecord {
  accessPolicies: AccessPolicy[];
  account: Account;
  authMethod: AuthMethod | null;
  credential: Credential | null;
  provider: Provider;
}

export interface UsageSummary {
  currencies: string[];
  lastRecordedAt: string | null;
  totalCost: number | null;
  totalEvents: number;
}

export interface RecentUsageSummary {
  accountId: string;
  accountName: string;
  id: string;
  model: string | null;
  operation: string;
  providerLabel: string;
  providerType: ProviderType;
  recordedAt: string;
}

export interface ProjectWorkGatewayStatus {
  accountId: string | null;
  accountName: string | null;
  authMethodType: AuthMethodType | null;
  isReady: boolean;
  providerLabel: string | null;
  providerType: ProviderType | null;
  reason: string | null;
}

export interface AccountManagerSnapshot {
  accounts: AccountRecord[];
  providers: Provider[];
  recentUsage: RecentUsageSummary[];
  projectWorkGateway: ProjectWorkGatewayStatus;
  usageSummary: UsageSummary;
}

export interface ResolvedAccountAccess {
  accessPolicies: AccessPolicy[];
  account: Account;
  authMethod: AuthMethod | null;
  credential: Credential | null;
  provider: Provider;
  secretPayload: SecretPayload | null;
}

export class AccountManagerService {
  getSnapshot(context: WorkspaceContext): AccountManagerSnapshot {
    const accounts = this.listAccountRecords(context);
    const recentUsage = this.buildRecentUsage(context, accounts);

    return {
      accounts,
      providers: PROVIDER_CATALOG,
      recentUsage,
      projectWorkGateway: this.describeCapability(accounts, "planning"),
      usageSummary: summarizeUsage(
        context.repositories.usageEvents.countAll(),
        recentUsage,
        context.repositories.costRecords.listAll(),
      ),
    };
  }

  registerProviderAccount(context: WorkspaceContext, input: RegisterProviderAccountInput): AccountRecord {
    const provider = this.requireProvider(input.providerType);
    const name = input.name.trim();
    const authMethodType = input.authMethodType;
    const authMethodConfig = input.authMethodConfig ?? null;
    const baseUrl = normalizeOptionalText(input.baseUrl);
    const credentialMetadata = input.credentialMetadata ?? null;
    const defaultModel = normalizeOptionalText(input.defaultModel);
    const secretHint = normalizeOptionalText(input.secretHint);
    const secretPayload = input.secretPayload ?? null;
    const secretValue = normalizeOptionalText(input.secretValue);
    const hasSecretMaterial = secretPayload !== null || secretValue !== null;

    if (name.length === 0) {
      throw new Error("Account name is required.");
    }

    if (!provider.supportedAuthMethods.includes(authMethodType)) {
      throw new Error(`${provider.label} does not support auth method "${authMethodType}".`);
    }

    if (provider.baseUrlRequirement === "required" && !baseUrl) {
      throw new Error(`${provider.label} requires an API base URL.`);
    }

    if (authMethodType === "api_key" && !hasSecretMaterial) {
      throw new Error("An API key is required for the selected auth method.");
    }

    const credentialStatus = hasSecretMaterial || !authMethodRequiresSecret(authMethodType) ? "configured" : "pending";
    const timestamp = nowIso();
    const accountId = createId("account");
    const authMethodId = createId("auth");
    const credentialId = createId("cred");
    const secretRef = hasSecretMaterial ? createId("secret") : null;

    const account: Account = {
      id: accountId,
      name,
      providerType: provider.type,
      baseUrl: baseUrl ?? provider.defaultBaseUrl,
      status: "active",
      defaultModel,
      config: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const authMethod: AuthMethod = {
      id: authMethodId,
      accountId,
      type: authMethodType,
      label: buildAuthMethodLabel(authMethodType),
      config: authMethodConfig,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const credential: Credential = {
      id: credentialId,
      accountId,
      authMethodId,
      secretRef,
      secretHint: buildSecretHint(authMethodType, {
        secretHint,
        secretPayload,
        secretValue,
      }),
      status: credentialStatus,
      metadata: credentialMetadata,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const accessPolicy: AccessPolicy = {
      id: createId("policy"),
      accountId,
      name: "Default workspace access",
      effect: "allow",
      capabilities: ["planning", "execution", "usage"],
      active: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    context.database.connection.transaction(() => {
      context.repositories.accounts.create(account);
      context.repositories.authMethods.create(authMethod);
      context.repositories.credentials.create(credential);
      context.repositories.accessPolicies.create(accessPolicy);

      if (secretRef) {
        context.secretStore.put(secretRef, resolveSecretPayload(authMethodType, secretPayload, secretValue));
      }
    })();

    return {
      accessPolicies: [accessPolicy],
      account,
      authMethod,
      credential,
      provider,
    };
  }

  deleteProviderAccount(context: WorkspaceContext, accountId: string): void {
    const normalizedAccountId = accountId.trim();
    if (normalizedAccountId.length === 0) {
      throw new Error("Account id is required.");
    }

    const account = context.repositories.accounts.findById(normalizedAccountId);
    if (!account) {
      throw new Error(`Provider account "${normalizedAccountId}" was not found.`);
    }

    const credential = context.repositories.credentials.findByAccountId(normalizedAccountId);

    context.database.connection.transaction(() => {
      if (credential?.secretRef) {
        context.secretStore.delete(credential.secretRef);
      }

      context.repositories.accounts.delete(normalizedAccountId);
    })();
  }

  requireCapability(context: WorkspaceContext, capability: AccessCapability): ResolvedAccountAccess {
    const accounts = this.listAccountRecords(context);
    const match = this.findCapabilityMatch(accounts, capability);
    if (!match) {
      throw new Error(buildCapabilityError(capability));
    }

    return {
      accessPolicies: match.accessPolicies,
      account: match.account,
      authMethod: match.authMethod,
      credential: match.credential,
      provider: match.provider,
      secretPayload:
        match.credential?.secretRef && match.credential.status === "configured"
          ? context.secretStore.get(match.credential.secretRef)
          : null,
    };
  }

  private listAccountRecords(context: WorkspaceContext): AccountRecord[] {
    return context.repositories.accounts.listAll().map((account) => {
      const provider = this.requireProvider(account.providerType);
      const authMethod = context.repositories.authMethods.findByAccountId(account.id);
      const credential = context.repositories.credentials.findByAccountId(account.id);
      const accessPolicies = context.repositories.accessPolicies.listByAccountId(account.id);

      return {
        accessPolicies,
        account,
        authMethod,
        credential,
        provider,
      };
    });
  }

  private buildRecentUsage(context: WorkspaceContext, accounts: AccountRecord[]): RecentUsageSummary[] {
    const accountById = new Map(accounts.map((record) => [record.account.id, record]));

    return context.repositories.usageEvents.listRecent(10).flatMap((event) => {
      const record = accountById.get(event.accountId);
      if (!record) {
        return [];
      }

      return [
        {
          accountId: record.account.id,
          accountName: record.account.name,
          id: event.id,
          model: event.model,
          operation: event.operation,
          providerLabel: record.provider.label,
          providerType: event.providerType,
          recordedAt: event.recordedAt,
        },
      ];
    });
  }

  private describeCapability(
    accounts: AccountRecord[],
    capability: AccessCapability,
  ): ProjectWorkGatewayStatus {
    const match = this.findCapabilityMatch(accounts, capability);
    if (!match) {
      return {
        accountId: null,
        accountName: null,
        authMethodType: null,
        isReady: false,
        providerLabel: null,
        providerType: null,
        reason: buildCapabilityError(capability),
      };
    }

    return {
      accountId: match.account.id,
      accountName: match.account.name,
      authMethodType: match.authMethod?.type ?? null,
      isReady: true,
      providerLabel: match.provider.label,
      providerType: match.provider.type,
      reason: null,
    };
  }

  private findCapabilityMatch(
    accounts: AccountRecord[],
    capability: AccessCapability,
  ): AccountRecord | null {
    return (
      accounts.find((record) => {
        if (record.account.status !== "active") {
          return false;
        }

        if (!isCredentialReady(record)) {
          return false;
        }

        const activePolicies = record.accessPolicies.filter((policy) => policy.active);
        const relevantPolicies = activePolicies.filter((policy) => policy.capabilities.includes(capability));

        if (relevantPolicies.length === 0) {
          return false;
        }

        if (relevantPolicies.some((policy) => policy.effect === "deny")) {
          return false;
        }

        return relevantPolicies.some((policy) => policy.effect === "allow" || policy.effect === "review");
      }) ?? null
    );
  }

  private requireProvider(providerType: ProviderType): Provider {
    const provider = PROVIDER_CATALOG.find((candidate) => candidate.type === providerType);
    if (!provider) {
  throw new Error(`Unknown provider type "${providerType}".`);
    }

    return provider;
  }
}

function isCredentialReady(record: AccountRecord): boolean {
  if (!record.authMethod || !record.credential) {
    return false;
  }

  return record.credential.status === "configured";
}

function summarizeUsage(totalEvents: number, recentUsage: RecentUsageSummary[], costRecords: CostRecord[]): UsageSummary {
  const amountsByCurrency = new Map<string, number>();

  for (const record of costRecords) {
    if (!record.currency || record.amount === null) {
      continue;
    }

    amountsByCurrency.set(record.currency, (amountsByCurrency.get(record.currency) ?? 0) + record.amount);
  }

  const currencies = [...amountsByCurrency.keys()].sort();
  const totalCost = currencies.length === 1 ? amountsByCurrency.get(currencies[0] ?? "") ?? null : null;

  return {
    currencies,
    lastRecordedAt: recentUsage[0]?.recordedAt ?? null,
    totalCost,
    totalEvents,
  };
}

function buildAuthMethodLabel(authMethodType: AuthMethodType): string {
  switch (authMethodType) {
    case "api_key":
      return "API Key";
    case "oauth":
      return "OAuth";
    case "local_endpoint":
      return "Local Endpoint";
    case "custom":
      return "Custom";
  }
}

function authMethodRequiresSecret(authMethodType: AuthMethodType): boolean {
  switch (authMethodType) {
    case "api_key":
      return true;
    case "oauth":
      return true;
    case "local_endpoint":
      return false;
    case "custom":
      return true;
  }
}

function buildSecretPayload(authMethodType: AuthMethodType, secretValue: string): SecretPayload {
  switch (authMethodType) {
    case "api_key":
      return { apiKey: secretValue };
    case "oauth":
      return { accessToken: secretValue };
    case "local_endpoint":
      return { credential: secretValue };
    case "custom":
      return { credential: secretValue };
  }
}

function buildSecretHint(
  authMethodType: AuthMethodType,
  input: {
    secretHint: string | null;
    secretPayload: SecretPayload | null;
    secretValue: string | null;
  },
): string | null {
  if (input.secretHint) {
    return input.secretHint;
  }

  if (!input.secretPayload && !input.secretValue) {
    return null;
  }

  if (authMethodType === "oauth") {
    return "OAuth connected";
  }

  if (input.secretValue) {
    return redactSecret(input.secretValue);
  }

  return "Configured";
}

function resolveSecretPayload(
  authMethodType: AuthMethodType,
  secretPayload: SecretPayload | null,
  secretValue: string | null,
): SecretPayload {
  if (secretPayload) {
    return secretPayload;
  }

  if (!secretValue) {
    throw new Error(`Secret payload is required for auth method "${authMethodType}".`);
  }

  return buildSecretPayload(authMethodType, secretValue);
}

function buildCapabilityError(capability: AccessCapability): string {
  switch (capability) {
    case "planning":
      return 'No provider account is ready for project planning. Add an account in the Account Manager first.';
    case "execution":
      return 'No provider account is ready for task execution. Add an account in the Account Manager first.';
    case "usage":
      return "No provider account is available for usage reporting.";
  }
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function redactSecret(secretValue: string): string {
  const trimmed = secretValue.trim();
  if (trimmed.length <= 4) {
    return "••••";
  }

  return `••••${trimmed.slice(-4)}`;
}

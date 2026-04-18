import type { JsonObject } from "./event.js";

export const PROVIDER_TYPES = [
  "openai",
  "anthropic",
  "openai-compatible",
  "ollama",
  "self-hosted-router",
  "custom",
] as const;

export type ProviderType = (typeof PROVIDER_TYPES)[number];

export const AUTH_METHOD_TYPES = ["api_key", "oauth", "local_endpoint", "custom"] as const;

export type AuthMethodType = (typeof AUTH_METHOD_TYPES)[number];

export const ACCOUNT_STATUSES = ["active", "disabled"] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const CREDENTIAL_STATUSES = ["configured", "pending"] as const;

export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const ACCESS_EFFECTS = ["allow", "review", "deny"] as const;

export type AccessEffect = (typeof ACCESS_EFFECTS)[number];

export const ACCESS_CAPABILITIES = ["planning", "execution", "usage"] as const;

export type AccessCapability = (typeof ACCESS_CAPABILITIES)[number];

export type BaseUrlRequirement = "optional" | "required";

export interface Provider {
  type: ProviderType;
  label: string;
  description: string;
  defaultBaseUrl: string | null;
  baseUrlRequirement: BaseUrlRequirement;
  supportedAuthMethods: AuthMethodType[];
}

export interface Account {
  id: string;
  name: string;
  providerType: ProviderType;
  baseUrl: string | null;
  status: AccountStatus;
  defaultModel: string | null;
  config: JsonObject | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthMethod {
  id: string;
  accountId: string;
  type: AuthMethodType;
  label: string;
  config: JsonObject | null;
  createdAt: string;
  updatedAt: string;
}

export interface Credential {
  id: string;
  accountId: string;
  authMethodId: string;
  secretRef: string | null;
  secretHint: string | null;
  status: CredentialStatus;
  metadata: JsonObject | null;
  createdAt: string;
  updatedAt: string;
}

export interface UsageEvent {
  id: string;
  accountId: string;
  providerType: ProviderType;
  model: string | null;
  operation: string;
  requestId: string | null;
  usage: JsonObject | null;
  recordedAt: string;
  createdAt: string;
}

export interface CostRecord {
  id: string;
  accountId: string;
  usageEventId: string | null;
  providerType: ProviderType;
  model: string | null;
  currency: string | null;
  amount: number | null;
  pricingUnit: string | null;
  metadata: JsonObject | null;
  recordedAt: string;
  createdAt: string;
}

export interface AccessPolicy {
  id: string;
  accountId: string;
  name: string;
  effect: AccessEffect;
  capabilities: AccessCapability[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

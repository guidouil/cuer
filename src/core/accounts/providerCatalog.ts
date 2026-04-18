import type { Provider } from "../../domain/index.js";

export const PROVIDER_CATALOG: Provider[] = [
  {
    type: "openai",
    label: "OpenAI",
    description: "Hosted OpenAI API accounts.",
    defaultBaseUrl: "https://api.openai.com/v1",
    baseUrlRequirement: "optional",
    supportedAuthMethods: ["api_key", "oauth"],
  },
  {
    type: "anthropic",
    label: "Anthropic",
    description: "Hosted Anthropic API accounts.",
    defaultBaseUrl: "https://api.anthropic.com",
    baseUrlRequirement: "optional",
    supportedAuthMethods: ["api_key"],
  },
  {
    type: "openai-compatible",
    label: "OpenAI-Compatible Endpoint",
    description: "Custom endpoints that expose an OpenAI-style API.",
    defaultBaseUrl: null,
    baseUrlRequirement: "required",
    supportedAuthMethods: ["api_key", "oauth", "local_endpoint", "custom"],
  },
  {
    type: "ollama",
    label: "Ollama / Local Router",
    description: "Local model runners or local router processes.",
    defaultBaseUrl: "http://localhost:11434/v1",
    baseUrlRequirement: "required",
    supportedAuthMethods: ["local_endpoint", "api_key", "custom"],
  },
  {
    type: "self-hosted-router",
    label: "Self-Hosted Router",
    description: "Self-hosted gateways that front one or more providers.",
    defaultBaseUrl: null,
    baseUrlRequirement: "required",
    supportedAuthMethods: ["api_key", "oauth", "local_endpoint", "custom"],
  },
  {
    type: "custom",
    label: "Custom Provider",
    description: "A placeholder for provider integrations that do not fit the built-in list yet.",
    defaultBaseUrl: null,
    baseUrlRequirement: "optional",
    supportedAuthMethods: ["api_key", "oauth", "local_endpoint", "custom"],
  },
];

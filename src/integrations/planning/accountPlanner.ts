import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { ResolvedAccountAccess } from "../../core/accounts/accountManagerService.js";
import type { ProviderPlannerPort, ProviderPlannerRequest } from "../../core/planner/providerPlannerPort.js";
import { CuerError } from "../../utils/errors.js";

const ANTHROPIC_API_VERSION = "2023-06-01";
const OPENAI_COMPATIBLE_PROVIDER_TYPES = new Set<string>([
  "openai",
  "openai-compatible",
  "ollama",
  "self-hosted-router",
  "custom",
] as const);

let plannerPromptCache: string | null = null;

export function createProviderPlanner(gateway: ResolvedAccountAccess): ProviderPlannerPort {
  const model = gateway.account.defaultModel?.trim();
  if (!model) {
    throw new CuerError(
      `Planning account "${gateway.account.name}" is missing a default model. Configure one in the Account Manager first.`,
    );
  }

  if (OPENAI_COMPATIBLE_PROVIDER_TYPES.has(gateway.provider.type)) {
    return new OpenAiCompatibleAccountPlanner(gateway, model);
  }

  if (gateway.provider.type === "anthropic") {
    return new AnthropicAccountPlanner(gateway, model);
  }

  throw new CuerError(`Provider "${gateway.provider.label}" does not support planner execution yet.`);
}

abstract class BaseAccountPlanner implements ProviderPlannerPort {
  readonly name: string;

  constructor(
    protected readonly gateway: ResolvedAccountAccess,
    protected readonly model: string,
  ) {
    this.name = `${gateway.provider.type}:${model}`;
  }

  abstract createResponse(input: ProviderPlannerRequest): Promise<string>;

  protected async buildPromptContext(input: ProviderPlannerRequest): Promise<{
    jsonSystemPrompt: string;
    toolSystemPrompt: string;
    userMessage: string;
  }> {
    const plannerPrompt = await loadBundledPlannerPrompt();
    const repositoryInstructions = await readWorkspaceInstructions(input.rootPath);
    const userPayload = {
      projectId: input.projectId,
      projectName: input.projectName,
      goal: input.goal,
      clarificationAnswers: input.clarificationAnswers,
      ...(repositoryInstructions ? { repositoryInstructions } : {}),
    };

    return {
      jsonSystemPrompt: buildJsonSystemPrompt(plannerPrompt),
      toolSystemPrompt: buildToolSystemPrompt(plannerPrompt),
      userMessage: JSON.stringify(userPayload, null, 2),
    };
  }

  protected requireBaseUrl(): string {
    const baseUrl = this.gateway.account.baseUrl?.trim();
    if (!baseUrl) {
      throw new CuerError(`Planning account "${this.gateway.account.name}" is missing a base URL.`);
    }

    return ensureTrailingSlash(baseUrl);
  }
}

class OpenAiCompatibleAccountPlanner extends BaseAccountPlanner {
  async createResponse(input: ProviderPlannerRequest): Promise<string> {
    const prompt = await this.buildPromptContext(input);
    const endpoint = new URL("chat/completions", this.requireBaseUrl());
    const headers = buildOpenAiCompatibleHeaders(this.gateway);
    const toolRequest = {
      max_tokens: 4000,
      messages: [
        { role: "system", content: prompt.toolSystemPrompt },
        { role: "user", content: prompt.userMessage },
      ],
      model: this.model,
      temperature: 0,
      tool_choice: "required",
      tools: buildOpenAiCompatibleTools(input.projectId),
    };

    const toolResponse = await postJson(endpoint, headers, toolRequest, "planner tool request");
    if (toolResponse.ok) {
      return extractOpenAiPlannerResponse(toolResponse.body, input.projectId);
    }

    if (!shouldRetryWithoutTools(toolResponse.status, toolResponse.body)) {
      throw buildPlannerRequestError("planner request", toolResponse.status, toolResponse.body);
    }

    const fallbackRequest = {
      max_tokens: 4000,
      messages: [
        { role: "system", content: prompt.jsonSystemPrompt },
        { role: "user", content: prompt.userMessage },
      ],
      model: this.model,
      temperature: 0,
    };
    const fallbackResponse = await postJson(endpoint, headers, fallbackRequest, "planner fallback request");
    if (!fallbackResponse.ok) {
      throw buildPlannerRequestError("planner fallback request", fallbackResponse.status, fallbackResponse.body);
    }

    return extractOpenAiPlannerResponse(fallbackResponse.body, input.projectId);
  }
}

class AnthropicAccountPlanner extends BaseAccountPlanner {
  async createResponse(input: ProviderPlannerRequest): Promise<string> {
    const prompt = await this.buildPromptContext(input);
    const endpoint = new URL("v1/messages", this.requireBaseUrl());
    const headers = buildAnthropicHeaders(this.gateway);
    const request = {
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt.userMessage }],
      model: this.model,
      system: prompt.toolSystemPrompt,
      temperature: 0,
      tool_choice: {
        type: "any",
      },
      tools: buildAnthropicTools(input.projectId),
    };
    const response = await postJson(endpoint, headers, request, "planner request");
    if (!response.ok) {
      throw buildPlannerRequestError("planner request", response.status, response.body);
    }

    return extractAnthropicPlannerResponse(response.body, input.projectId);
  }
}

async function postJson(
  endpoint: URL,
  headers: Record<string, string>,
  body: unknown,
  operation: string,
): Promise<{
  body: string;
  ok: boolean;
  status: number;
}> {
  let response: Response;

  try {
    response = await fetch(endpoint, {
      body: JSON.stringify(body),
      headers,
      method: "POST",
    });
  } catch (error) {
    throw new CuerError(`Failed to reach ${operation} at ${endpoint.toString()}: ${toErrorMessage(error)}`);
  }

  return {
    body: await response.text(),
    ok: response.ok,
    status: response.status,
  };
}

function buildOpenAiCompatibleHeaders(gateway: ResolvedAccountAccess): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  const authMethodType = gateway.authMethod?.type ?? null;

  switch (authMethodType) {
    case "api_key": {
      const apiKey = gateway.secretPayload?.apiKey?.trim();
      if (!apiKey) {
        throw new CuerError(`Planning account "${gateway.account.name}" is missing its API key secret.`);
      }
      headers.authorization = `Bearer ${apiKey}`;
      return headers;
    }
    case "oauth": {
      const accessToken = gateway.secretPayload?.accessToken?.trim();
      if (!accessToken) {
        throw new CuerError(`Planning account "${gateway.account.name}" is missing its OAuth access token.`);
      }
      const tokenType = gateway.secretPayload?.tokenType?.trim() || "Bearer";
      headers.authorization = `${tokenType} ${accessToken}`;
      return headers;
    }
    case "local_endpoint":
      return headers;
    case "custom":
      throw new CuerError(
        `Planning account "${gateway.account.name}" uses an unsupported custom auth method for provider-backed planning.`,
      );
    default:
      throw new CuerError(`Planning account "${gateway.account.name}" has no supported auth method configured.`);
  }
}

function buildAnthropicHeaders(gateway: ResolvedAccountAccess): Record<string, string> {
  const apiKey = gateway.secretPayload?.apiKey?.trim();
  if (!apiKey) {
    throw new CuerError(`Planning account "${gateway.account.name}" is missing its Anthropic API key secret.`);
  }

  return {
    accept: "application/json",
    "anthropic-version": ANTHROPIC_API_VERSION,
    "content-type": "application/json",
    "x-api-key": apiKey,
  };
}

function buildToolSystemPrompt(plannerPrompt: string): string {
  return [
    "Follow the planner contract below.",
    "Call exactly one function: ask_user or create_plan.",
    "Do not answer in plain text.",
    plannerPrompt,
  ].join("\n\n");
}

function buildJsonSystemPrompt(plannerPrompt: string): string {
  return [
    "Follow the planner contract below.",
    "Return valid JSON only.",
    plannerPrompt,
  ].join("\n\n");
}

function buildOpenAiCompatibleTools(projectId: string): Array<Record<string, unknown>> {
  return [
    {
      type: "function",
      function: {
        name: "ask_user",
        description: "Ask only the blocking clarification questions required to continue planning safely.",
        parameters: buildAskUserSchema(projectId),
      },
    },
    {
      type: "function",
      function: {
        name: "create_plan",
        description: "Create an ordered atomic implementation plan when a safe minimal path exists.",
        parameters: buildCreatePlanSchema(projectId),
      },
    },
  ];
}

function buildAnthropicTools(projectId: string): Array<Record<string, unknown>> {
  return [
    {
      description: "Ask only the blocking clarification questions required to continue planning safely.",
      input_schema: buildAskUserSchema(projectId),
      name: "ask_user",
    },
    {
      description: "Create an ordered atomic implementation plan when a safe minimal path exists.",
      input_schema: buildCreatePlanSchema(projectId),
      name: "create_plan",
    },
  ];
}

function buildAskUserSchema(projectId: string): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["projectId", "summary", "blockingUnknowns", "questions", "projectSearch"],
    properties: {
      projectId: {
        type: "string",
        enum: [projectId],
      },
      summary: {
        type: "string",
      },
      blockingUnknowns: {
        type: "array",
        items: {
          type: "string",
        },
      },
      questions: {
        type: "array",
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "question", "why"],
          properties: {
            id: {
              type: "string",
            },
            question: {
              type: "string",
            },
            why: {
              type: "string",
            },
          },
        },
      },
      projectSearch: buildProjectSearchSchema(),
    },
  };
}

function buildCreatePlanSchema(projectId: string): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["projectId", "summary", "assumptions", "unknowns", "projectSearch", "tasks", "qualityChecks"],
    properties: {
      projectId: {
        type: "string",
        enum: [projectId],
      },
      summary: {
        type: "string",
      },
      assumptions: {
        type: "array",
        items: {
          type: "string",
        },
      },
      unknowns: {
        type: "array",
        items: {
          type: "string",
        },
      },
      projectSearch: buildProjectSearchSchema(),
      tasks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "id",
            "projectId",
            "title",
            "type",
            "goal",
            "input",
            "action",
            "output",
            "validation",
            "dependsOn",
            "taskSearch",
          ],
          properties: {
            id: {
              type: "string",
            },
            projectId: {
              type: "string",
              enum: [projectId],
            },
            title: {
              type: "string",
            },
            type: {
              type: "string",
              enum: ["clarification", "analysis", "implementation", "test", "documentation", "deployment"],
            },
            goal: {
              type: "string",
            },
            input: {
              type: "string",
            },
            action: {
              type: "string",
            },
            output: {
              type: "string",
            },
            validation: {
              type: "string",
            },
            dependsOn: {
              type: "array",
              items: {
                type: "string",
              },
            },
            taskSearch: buildTaskSearchSchema(),
          },
        },
      },
      qualityChecks: {
        type: "object",
        additionalProperties: false,
        required: ["allAtomic", "allTestable", "dependenciesExplicit", "noVagueTasks"],
        properties: {
          allAtomic: {
            type: "boolean",
          },
          allTestable: {
            type: "boolean",
          },
          dependenciesExplicit: {
            type: "boolean",
          },
          noVagueTasks: {
            type: "boolean",
          },
        },
      },
    },
  };
}

function buildProjectSearchSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["keywords", "domains", "intent", "stackCandidates", "constraints"],
    properties: {
      keywords: {
        type: "array",
        items: {
          type: "string",
        },
      },
      domains: {
        type: "array",
        items: {
          type: "string",
        },
      },
      intent: {
        type: "string",
      },
      stackCandidates: {
        type: "array",
        items: {
          type: "string",
        },
      },
      constraints: {
        type: "array",
        items: {
          type: "string",
        },
      },
    },
  };
}

function buildTaskSearchSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["keywords", "domains", "intent"],
    properties: {
      keywords: {
        type: "array",
        items: {
          type: "string",
        },
      },
      domains: {
        type: "array",
        items: {
          type: "string",
        },
      },
      intent: {
        type: "string",
      },
    },
  };
}

function extractOpenAiPlannerResponse(rawBody: string, projectId: string): string {
  const parsed = parseJsonObject(rawBody, "planner response");
  const choices = readArray(parsed.choices, "planner response.choices");
  const choice = ensureRecord(choices[0], "planner response.choices[0]");
  const message = ensureRecord(choice.message, "planner response.choices[0].message");
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];

  if (toolCalls.length > 0) {
    const toolCall = ensureRecord(toolCalls[0], "planner response.choices[0].message.tool_calls[0]");
    const functionPayload = ensureRecord(
      toolCall.function,
      "planner response.choices[0].message.tool_calls[0].function",
    );
    const name = readString(functionPayload.name, "planner response tool name");
    const argumentsText = readString(functionPayload.arguments, "planner response tool arguments");
    return materializePlannerResponseJson(name, parseJsonObject(argumentsText, "planner tool arguments"), projectId);
  }

  const content = typeof message.content === "string" ? message.content.trim() : "";
  if (content.length === 0) {
    throw new CuerError("Planner response did not include either a tool call or JSON content.");
  }

  return content;
}

function extractAnthropicPlannerResponse(rawBody: string, projectId: string): string {
  const parsed = parseJsonObject(rawBody, "planner response");
  const content = readArray(parsed.content, "planner response.content");

  for (let index = 0; index < content.length; index += 1) {
    const block = ensureRecord(content[index], `planner response.content[${index}]`);
    if (block.type === "tool_use") {
      const name = readString(block.name, `planner response.content[${index}].name`);
      const toolInput = ensureRecord(block.input, `planner response.content[${index}].input`);
      return materializePlannerResponseJson(name, toolInput, projectId);
    }
  }

  const textContent = content
    .map((entry, index) => {
      const block = ensureRecord(entry, `planner response.content[${index}]`);
      return block.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .join("")
    .trim();

  if (textContent.length === 0) {
    throw new CuerError("Planner response did not include either a tool call or JSON content.");
  }

  return textContent;
}

function materializePlannerResponseJson(
  name: string,
  payload: Record<string, unknown>,
  projectId: string,
): string {
  if (name === "ask_user") {
    return JSON.stringify({
      ...payload,
      mode: "ask_user",
      projectId,
    });
  }

  if (name === "create_plan") {
    return JSON.stringify({
      ...payload,
      mode: "create_plan",
      projectId,
    });
  }

  throw new CuerError(`Planner returned an unknown function call "${name}".`);
}

async function loadBundledPlannerPrompt(): Promise<string> {
  if (plannerPromptCache) {
    return plannerPromptCache;
  }

  const bundledPromptPath = fileURLToPath(new URL("../../../prompts/planner.md", import.meta.url));
  const executableDir = dirname(process.execPath);
  const candidates = [
    bundledPromptPath,
    join(executableDir, "prompts", "planner.md"),
    join(executableDir, "..", "prompts", "planner.md"),
  ];

  for (const candidate of candidates) {
    if (!(await fileExists(candidate))) {
      continue;
    }

    plannerPromptCache = await readFile(candidate, "utf8");
    return plannerPromptCache;
  }

  throw new CuerError("Bundled planner prompt was not found. Reinstall or rebuild the application assets.");
}

async function readWorkspaceInstructions(rootPath: string): Promise<string | null> {
  const instructionsPath = join(rootPath, "AGENTS.md");
  if (!(await fileExists(instructionsPath))) {
    return null;
  }

  const content = await readFile(instructionsPath, "utf8");
  return content.trim().length > 0 ? content : null;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function shouldRetryWithoutTools(status: number, body: string): boolean {
  if (status < 400 || status >= 500) {
    return false;
  }

  return /(tool|function|tool_choice|unsupported|unknown field|schema)/i.test(body);
}

function buildPlannerRequestError(operation: string, status: number, rawBody: string): CuerError {
  const message = extractApiErrorMessage(rawBody) ?? rawBody.trim();
  if (message.length === 0) {
    return new CuerError(`Planner ${operation} failed with status ${status}.`);
  }

  return new CuerError(`Planner ${operation} failed with status ${status}: ${message}`);
}

function extractApiErrorMessage(rawBody: string): string | null {
  const body = rawBody.trim();
  if (body.length === 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(body) as {
      error?: unknown;
      message?: unknown;
    };
    if (typeof parsed.message === "string" && parsed.message.trim().length > 0) {
      return parsed.message.trim();
    }

    if (parsed.error && typeof parsed.error === "object" && !Array.isArray(parsed.error)) {
      const nested = parsed.error as {
        message?: unknown;
        type?: unknown;
      };
      if (typeof nested.message === "string" && nested.message.trim().length > 0) {
        return nested.message.trim();
      }
      if (typeof nested.type === "string" && nested.type.trim().length > 0) {
        return nested.type.trim();
      }
    }
  } catch {
    // Ignore parse failures and fall back to the raw body.
  }

  return body;
}

function parseJsonObject(rawBody: string, label: string): Record<string, unknown> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawBody) as unknown;
  } catch (error) {
    throw new CuerError(`${label} was not valid JSON: ${toErrorMessage(error)}`);
  }

  return ensureRecord(parsed, label);
}

function ensureRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new CuerError(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
}

function readArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new CuerError(`${label} must be an array.`);
  }

  return value;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CuerError(`${label} must be a non-empty string.`);
  }

  return value;
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

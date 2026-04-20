import type {
  AskUserPlannerResponse,
  CreatePlanPlannerResponse,
  ExternalPlannerResponse,
  PlanDraft,
  PlannerAnswer,
  PlannerInquiry,
  PlannerQuestion,
  PlannerResponseTaskType,
  PlannerTaskResponse,
  PlanQualityChecks,
  ProjectSearchHints,
  TaskSearchHints,
} from "../../domain/index.js";
import { CuerError } from "../../utils/errors.js";

const ASK_USER_KEYS = ["projectId", "mode", "summary", "blockingUnknowns", "questions", "projectSearch"];
const CREATE_PLAN_KEYS = [
  "projectId",
  "mode",
  "summary",
  "assumptions",
  "unknowns",
  "projectSearch",
  "tasks",
  "qualityChecks",
];
const QUESTION_KEYS = ["id", "question", "why"];
const PROJECT_SEARCH_KEYS = ["keywords", "domains", "intent", "stackCandidates", "constraints"];
const TASK_SEARCH_KEYS = ["keywords", "domains", "intent"];
const TASK_KEYS = [
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
];
const QUALITY_CHECK_KEYS = ["allAtomic", "allTestable", "dependenciesExplicit", "noVagueTasks"];
const RESPONSE_TASK_TYPES: PlannerResponseTaskType[] = [
  "clarification",
  "analysis",
  "implementation",
  "test",
  "documentation",
  "deployment",
];

export function parseExternalPlannerResponse(raw: string): ExternalPlannerResponse {
  let value: unknown;

  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new CuerError("Planner response is not valid JSON.");
  }

  const root = expectObject(value, "response");
  const mode = expectString(root, "mode", "response");

  if (mode === "ask_user") {
    return parseAskUserResponse(root);
  }

  if (mode === "create_plan") {
    return parseCreatePlanResponse(root);
  }

  throw new CuerError('Planner response mode must be "ask_user" or "create_plan".');
}

export function createPlannerInquiry(response: AskUserPlannerResponse): PlannerInquiry {
  return {
    blockingUnknowns: response.blockingUnknowns,
    projectSearch: response.projectSearch,
    questions: response.questions,
    sourceProjectId: response.projectId,
    summary: response.summary,
  };
}

export function createPlanDraftFromPlannerResponse(
  response: CreatePlanPlannerResponse,
  plannerName: string,
  input: {
    clarificationAnswers?: PlannerAnswer[];
    goal: string;
  },
): PlanDraft {
  const taskIndexById = new Map(response.tasks.map((task, index) => [task.id, index]));
  const clarificationAnswers = input.clarificationAnswers ?? [];

  return {
    planner: normalizeText(plannerName) || "external-json-v1",
    summary: response.summary,
    details: {
      assumptions: response.assumptions,
      projectSearch: response.projectSearch,
      qualityChecks: response.qualityChecks,
      request: {
        clarificationAnswers,
        originalGoal: input.goal,
        resolvedGoal: input.goal,
      },
      sourceProjectId: response.projectId,
      unknowns: response.unknowns,
    },
    tasks: response.tasks.map((task, index) => ({
      title: task.title,
      description: buildTaskDescription(task),
      priority: index + 1,
      type: task.type,
      acceptanceCriteria: [task.validation],
      details: {
        action: task.action,
        goal: task.goal,
        input: task.input,
        output: task.output,
        plannerTaskId: task.id,
        taskSearch: task.taskSearch,
        validation: task.validation,
      },
    })),
    dependencies: response.tasks.flatMap((task, taskIndex) =>
      task.dependsOn.map((dependencyId) => ({
        taskIndex,
        dependsOnTaskIndex: expectTaskIndex(taskIndexById, dependencyId, task.id),
      })),
    ),
  };
}

function parseAskUserResponse(root: Record<string, unknown>): AskUserPlannerResponse {
  assertExactKeys(root, ASK_USER_KEYS, "response");

  const response: AskUserPlannerResponse = {
    projectId: expectString(root, "projectId", "response"),
    mode: "ask_user",
    summary: expectString(root, "summary", "response"),
    blockingUnknowns: expectStringArray(root, "blockingUnknowns", "response"),
    questions: expectArray(root, "questions", "response").map((value, index) =>
      parseQuestion(value, `response.questions[${index}]`),
    ),
    projectSearch: parseProjectSearch(expectObjectProperty(root, "projectSearch", "response"), "response.projectSearch"),
  };

  if (response.questions.length > 5) {
    throw new CuerError("Planner ask_user response cannot contain more than 5 questions.");
  }

  if (response.questions.length === 0) {
    throw new CuerError("Planner ask_user response must contain at least one question.");
  }

  return response;
}

function parseCreatePlanResponse(root: Record<string, unknown>): CreatePlanPlannerResponse {
  assertExactKeys(root, CREATE_PLAN_KEYS, "response");

  const response: CreatePlanPlannerResponse = {
    projectId: expectString(root, "projectId", "response"),
    mode: "create_plan",
    summary: expectString(root, "summary", "response"),
    assumptions: expectStringArray(root, "assumptions", "response"),
    unknowns: expectStringArray(root, "unknowns", "response"),
    projectSearch: parseProjectSearch(expectObjectProperty(root, "projectSearch", "response"), "response.projectSearch"),
    tasks: expectArray(root, "tasks", "response").map((value, index) =>
      parseTask(value, `response.tasks[${index}]`),
    ),
    qualityChecks: parseQualityChecks(
      expectObjectProperty(root, "qualityChecks", "response"),
      "response.qualityChecks",
    ),
  };

  if (response.tasks.length === 0) {
    throw new CuerError("Planner create_plan response must contain at least one task.");
  }

  validateTaskOrdering(response);
  validateQualityChecks(response.qualityChecks);

  return response;
}

function parseQuestion(value: unknown, path: string): PlannerQuestion {
  const question = expectObject(value, path);
  assertExactKeys(question, QUESTION_KEYS, path);

  return {
    id: expectString(question, "id", path),
    question: expectString(question, "question", path),
    why: expectString(question, "why", path),
  };
}

function parseProjectSearch(value: Record<string, unknown>, path: string): ProjectSearchHints {
  assertExactKeys(value, PROJECT_SEARCH_KEYS, path);

  return {
    keywords: expectStringArray(value, "keywords", path),
    domains: expectStringArray(value, "domains", path),
    intent: expectString(value, "intent", path),
    stackCandidates: expectStringArray(value, "stackCandidates", path),
    constraints: expectStringArray(value, "constraints", path),
  };
}

function parseTaskSearch(value: Record<string, unknown>, path: string): TaskSearchHints {
  assertExactKeys(value, TASK_SEARCH_KEYS, path);

  return {
    keywords: expectStringArray(value, "keywords", path),
    domains: expectStringArray(value, "domains", path),
    intent: expectString(value, "intent", path),
  };
}

function parseTask(value: unknown, path: string): PlannerTaskResponse {
  const task = expectObject(value, path);
  assertExactKeys(task, TASK_KEYS, path);

  const type = expectString(task, "type", path);
  if (!RESPONSE_TASK_TYPES.includes(type as PlannerResponseTaskType)) {
    throw new CuerError(`Planner task type at ${path}.type is invalid.`);
  }

  return {
    id: expectString(task, "id", path),
    projectId: expectString(task, "projectId", path),
    title: expectString(task, "title", path),
    type: type as PlannerResponseTaskType,
    goal: expectString(task, "goal", path),
    input: expectString(task, "input", path),
    action: expectString(task, "action", path),
    output: expectString(task, "output", path),
    validation: expectString(task, "validation", path),
    dependsOn: expectStringArray(task, "dependsOn", path),
    taskSearch: parseTaskSearch(expectObjectProperty(task, "taskSearch", path), `${path}.taskSearch`),
  };
}

function parseQualityChecks(value: Record<string, unknown>, path: string): PlanQualityChecks {
  assertExactKeys(value, QUALITY_CHECK_KEYS, path);

  return {
    allAtomic: expectBoolean(value, "allAtomic", path),
    allTestable: expectBoolean(value, "allTestable", path),
    dependenciesExplicit: expectBoolean(value, "dependenciesExplicit", path),
    noVagueTasks: expectBoolean(value, "noVagueTasks", path),
  };
}

function validateTaskOrdering(response: CreatePlanPlannerResponse): void {
  const seenTaskIds = new Set<string>();

  response.tasks.forEach((task, index) => {
    const expectedTaskId = `T${index + 1}`;
    if (task.id !== expectedTaskId) {
      throw new CuerError(`Planner task ids must be sequential. Expected ${expectedTaskId} but received ${task.id}.`);
    }

    if (task.projectId !== response.projectId) {
      throw new CuerError(`Planner task ${task.id} has projectId "${task.projectId}" but response.projectId is "${response.projectId}".`);
    }

    const dependencySet = new Set<string>();
    for (const dependencyId of task.dependsOn) {
      if (!seenTaskIds.has(dependencyId)) {
        throw new CuerError(`Planner task ${task.id} depends on "${dependencyId}" before it is defined.`);
      }

      if (dependencySet.has(dependencyId)) {
        throw new CuerError(`Planner task ${task.id} declares duplicate dependency "${dependencyId}".`);
      }

      dependencySet.add(dependencyId);
    }

    seenTaskIds.add(task.id);
  });
}

function validateQualityChecks(qualityChecks: PlanQualityChecks): void {
  const failingChecks = Object.entries(qualityChecks)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);

  if (failingChecks.length === 0) {
    return;
  }

  throw new CuerError(`Planner quality checks failed: ${failingChecks.join(", ")}.`);
}

function buildTaskDescription(task: PlannerTaskResponse): string {
  return [
    `Goal: ${task.goal}`,
    `Input: ${task.input}`,
    `Action: ${task.action}`,
    `Output: ${task.output}`,
  ].join("\n");
}

function expectTaskIndex(taskIndexById: Map<string, number>, dependencyId: string, taskId: string): number {
  const index = taskIndexById.get(dependencyId);
  if (index === undefined) {
    throw new CuerError(`Planner task ${taskId} references unknown dependency "${dependencyId}".`);
  }

  return index;
}

function expectObject(value: unknown, path: string): Record<string, unknown> {
  if (!isObject(value)) {
    throw new CuerError(`${path} must be an object.`);
  }

  return value;
}

function expectObjectProperty(
  value: Record<string, unknown>,
  key: string,
  path: string,
): Record<string, unknown> {
  return expectObject(value[key], `${path}.${key}`);
}

function expectArray(value: Record<string, unknown>, key: string, path: string): unknown[] {
  const candidate = value[key];
  if (!Array.isArray(candidate)) {
    throw new CuerError(`${path}.${key} must be an array.`);
  }

  return candidate;
}

function expectString(value: Record<string, unknown>, key: string, path: string): string {
  const candidate = value[key];
  if (typeof candidate !== "string") {
    throw new CuerError(`${path}.${key} must be a string.`);
  }

  const normalized = normalizeText(candidate);
  if (normalized.length === 0) {
    throw new CuerError(`${path}.${key} must not be empty.`);
  }

  return normalized;
}

function expectBoolean(value: Record<string, unknown>, key: string, path: string): boolean {
  const candidate = value[key];
  if (typeof candidate !== "boolean") {
    throw new CuerError(`${path}.${key} must be a boolean.`);
  }

  return candidate;
}

function expectStringArray(value: Record<string, unknown>, key: string, path: string): string[] {
  return expectArray(value, key, path).map((entry, index) => {
    if (typeof entry !== "string") {
      throw new CuerError(`${path}.${key}[${index}] must be a string.`);
    }

    const normalized = normalizeText(entry);
    if (normalized.length === 0) {
      throw new CuerError(`${path}.${key}[${index}] must not be empty.`);
    }

    return normalized;
  });
}

function assertExactKeys(value: Record<string, unknown>, allowedKeys: string[], path: string): void {
  const keys = Object.keys(value);
  const unexpectedKeys = keys.filter((key) => !allowedKeys.includes(key));
  if (unexpectedKeys.length > 0) {
    throw new CuerError(`${path} contains unsupported keys: ${unexpectedKeys.join(", ")}.`);
  }

  const missingKeys = allowedKeys.filter((key) => !(key in value));
  if (missingKeys.length > 0) {
    throw new CuerError(`${path} is missing required keys: ${missingKeys.join(", ")}.`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

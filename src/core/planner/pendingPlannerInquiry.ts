import type { Event, JsonObject, PlannerInquiry } from "../../domain/index.js";

export interface PendingPlannerInquiry {
  createdAt: string;
  goal: string;
  inquiry: PlannerInquiry;
  planner: string;
}

const RESOLVING_EVENT_TYPES = new Set(["planner.questions.answered", "plan.created"]);

export function findPendingPlannerInquiry(events: Event[]): PendingPlannerInquiry | null {
  const sortedEvents = [...events].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  for (let index = 0; index < sortedEvents.length; index += 1) {
    const event = sortedEvents[index];
    if (!event || event.type !== "planner.questions.generated") {
      continue;
    }

    if (sortedEvents.slice(0, index).some((candidate) => RESOLVING_EVENT_TYPES.has(candidate.type))) {
      return null;
    }

    return parsePendingPlannerInquiry(event);
  }

  return null;
}

function parsePendingPlannerInquiry(event: Event): PendingPlannerInquiry | null {
  const payload = asObject(event.payload);
  if (!payload) {
    return null;
  }

  const summary = readString(payload.summary);
  const sourceProjectId = readString(payload.sourceProjectId);
  const planner = readString(payload.planner);
  const goal = readString(payload.goal);
  const blockingUnknowns = readStringArray(payload.blockingUnknowns);
  const questions = readQuestions(payload.questions);
  const projectSearch = readProjectSearch(payload.projectSearch);

  if (!summary || !sourceProjectId || !planner || !goal || !projectSearch || questions.length === 0) {
    return null;
  }

  return {
    createdAt: event.createdAt,
    goal,
    inquiry: {
      blockingUnknowns,
      projectSearch,
      questions,
      sourceProjectId,
      summary,
    },
    planner,
  };
}

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function readQuestions(value: unknown): PlannerInquiry["questions"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      const question = asObject(entry);
      if (!question) {
        return null;
      }

      const id = readString(question.id);
      const text = readString(question.question);
      const why = readString(question.why);
      if (!id || !text || !why) {
        return null;
      }

      return {
        id,
        question: text,
        why,
      };
    })
    .filter((question): question is PlannerInquiry["questions"][number] => question !== null);
}

function readProjectSearch(value: unknown): PlannerInquiry["projectSearch"] | null {
  const projectSearch = asObject(value);
  if (!projectSearch) {
    return null;
  }

  const intent = readString(projectSearch.intent);
  if (!intent) {
    return null;
  }

  return {
    constraints: readStringArray(projectSearch.constraints),
    domains: readStringArray(projectSearch.domains),
    intent,
    keywords: readStringArray(projectSearch.keywords),
    stackCandidates: readStringArray(projectSearch.stackCandidates),
  };
}

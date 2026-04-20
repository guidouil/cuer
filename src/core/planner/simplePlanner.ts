import type {
  PlanDraft,
  PlannerAnswer,
  PlannerDecision,
  PlannerInquiry,
  PlannerInput,
  PlannerPort,
  PlannerQuestion,
} from "../../domain/index.js";
import { truncate } from "../../utils/text.js";

const TECHNICAL_ANCHORS = [
  "account",
  "accounts",
  "adapter",
  "adapters",
  "api",
  "artifact",
  "artifacts",
  "auth",
  "cli",
  "command",
  "commands",
  "config",
  "database",
  "desktop",
  "event",
  "events",
  "file",
  "files",
  "integration",
  "planner",
  "plan",
  "prompt",
  "provider",
  "queue",
  "repository",
  "runner",
  "schema",
  "service",
  "sqlite",
  "task",
  "tasks",
  "tauri",
  "test",
  "tests",
  "typescript",
  "workflow",
];

const VAGUE_GOAL_PATTERNS = [
  /^(help|improve|fix|continue|support|refactor|clean up|work on|make)\b/i,
  /^(aide|ameliorer|ameliore|corriger|corrige|continuer|continue|supporter|supporte|refactorer|refacto|nettoyer|nettoie|travailler sur|travaille sur|faire)\b/i,
];

const FRENCH_MARKERS = [
  " le ",
  " la ",
  " les ",
  " des ",
  " une ",
  " un ",
  " que ",
  " quoi ",
  " depot",
  " projet",
];

export class SimplePlanner implements PlannerPort {
  readonly name = "simple-v2";

  createPlan(input: PlannerInput): PlannerDecision {
    const originalGoal = normalizeText(input.goal);
    const resolvedGoal = resolveGoal(originalGoal, input.clarificationAnswers);
    const inquiry = buildInquiryIfBlocked(input, originalGoal, resolvedGoal);
    if (inquiry) {
      return {
        kind: "questions",
        inquiry,
      };
    }

    return {
      kind: "plan",
      goal: resolvedGoal,
      draft: buildPlanDraft(input, originalGoal, resolvedGoal),
    };
  }
}

function buildInquiryIfBlocked(
  input: PlannerInput,
  originalGoal: string,
  resolvedGoal: string,
): PlannerInquiry | null {
  const language = detectLanguage(originalGoal);
  const goalTokens = tokenize(resolvedGoal);
  const hasTechnicalAnchor = containsTechnicalAnchor(resolvedGoal);
  const vagueGoal = VAGUE_GOAL_PATTERNS.some((pattern) => pattern.test(originalGoal));
  const questions: PlannerQuestion[] = [];
  const blockingUnknowns: string[] = [];

  if (goalTokens.length < 3 && !hasTechnicalAnchor) {
    questions.push({
      id: "Q1",
      question:
        language === "fr"
          ? "Quel livrable concret veux-tu obtenir dans ce depot ?"
          : "What concrete deliverable should this repository produce next?",
      why: "A minimal plan still needs one inspectable delivery target before tasks can be split safely.",
    });
    blockingUnknowns.push("Concrete deliverable is missing from the planning request.");
  }

  if ((vagueGoal || containsContextlessReference(originalGoal)) && !hasTechnicalAnchor) {
    questions.push({
      id: questions.length === 0 ? "Q1" : "Q2",
      question:
        language === "fr"
          ? "Quelle zone du projet faut-il modifier en priorite ?"
          : "Which part of the project should change first?",
      why: "Planning stays ambiguous until the first implementation scope is explicit.",
    });
    blockingUnknowns.push("Implementation scope is not explicit enough to order tasks safely.");
  }

  if (questions.length === 0) {
    return null;
  }

  return {
    blockingUnknowns,
    projectSearch: buildProjectSearchHints(resolvedGoal),
    questions,
    sourceProjectId: input.projectId,
    summary: `Clarification is required before planning work for "${truncate(originalGoal, 72)}".`,
  };
}

function buildPlanDraft(input: PlannerInput, originalGoal: string, resolvedGoal: string): PlanDraft {
  const projectId = slugifyProjectId(input.projectName);
  const structuredInput =
    input.clarificationAnswers.length === 0
      ? "The user objective and current repository state."
      : buildStructuredInput(input.clarificationAnswers);

  return {
    planner: "simple-v2",
    summary: `Local execution plan for "${truncate(resolvedGoal, 96)}" with an explicit handoff path.`,
    details: {
      assumptions: [
        "Execution stays local-first and terminal-first.",
        "A minimal vertical slice is acceptable before broader automation.",
        ...(input.clarificationAnswers.length > 0 ? ["Clarification answers from the operator are authoritative."] : []),
      ],
      projectSearch: buildProjectSearchHints(resolvedGoal),
      qualityChecks: {
        allAtomic: true,
        allTestable: true,
        dependenciesExplicit: true,
        noVagueTasks: true,
      },
      request: {
        clarificationAnswers: input.clarificationAnswers,
        originalGoal,
        resolvedGoal,
      },
      sourceProjectId: projectId,
      unknowns: [],
    },
    tasks: [
      {
        title: "Capture the execution slice",
        description: buildDescription({
          goal: `Restate "${resolvedGoal}" as one concrete local delivery slice.`,
          input: structuredInput,
          action: "Write the smallest implementation target that can be shipped next.",
          output: "One explicit delivery slice statement.",
        }),
        priority: 1,
        type: "analysis",
        acceptanceCriteria: ['The delivery slice can be checked without adding new scope.'],
        details: {
          plannerTaskId: "T1",
          goal: `Restate "${resolvedGoal}" as one concrete local delivery slice.`,
          input: structuredInput,
          action: "Write the smallest implementation target that can be shipped next.",
          output: "One explicit delivery slice statement.",
          taskSearch: {
            keywords: ["scope definition", "delivery slice"],
            domains: ["planning"],
            intent: "Define a minimal execution target.",
          },
          validation: "The delivery slice can be checked without adding new scope.",
        },
      },
      {
        title: "Model the plan data contract",
        description: buildDescription({
          goal: "Define the structured plan fields that downstream execution must preserve.",
          input: "The delivery slice statement from T1.",
          action: "Map the planning fields to explicit local domain structures.",
          output: "One plan data contract.",
        }),
        priority: 2,
        type: "analysis",
        acceptanceCriteria: [
          "Every runtime field needed by execution and inspection is represented explicitly.",
        ],
        details: {
          plannerTaskId: "T2",
          goal: "Define the structured plan fields that downstream execution must preserve.",
          input: "The delivery slice statement from T1.",
          action: "Map the planning fields to explicit local domain structures.",
          output: "One plan data contract.",
          taskSearch: {
            keywords: ["domain model", "task metadata", "plan schema"],
            domains: ["typescript"],
            intent: "Represent planner output in explicit local types.",
          },
          validation: "Every runtime field needed by execution and inspection is represented explicitly.",
        },
      },
      {
        title: "Implement the first runnable change",
        description: buildDescription({
          goal: `Create the first code change required to move "${resolvedGoal}" forward.`,
          input: "The structured plan contract from T2.",
          action: "Implement one isolated runtime change.",
          output: "One inspectable code change set.",
        }),
        priority: 3,
        type: "implementation",
        acceptanceCriteria: ["The change can be executed or inspected without hidden dependencies."],
        details: {
          plannerTaskId: "T3",
          goal: `Create the first code change required to move "${resolvedGoal}" forward.`,
          input: "The structured plan contract from T2.",
          action: "Implement one isolated runtime change.",
          output: "One inspectable code change set.",
          taskSearch: {
            keywords: ["implementation slice", "isolated change"],
            domains: ["typescript"],
            intent: "Apply one bounded runtime change.",
          },
          validation: "The change can be executed or inspected without hidden dependencies.",
        },
      },
      {
        title: "Verify the local behavior",
        description: buildDescription({
          goal: "Confirm that the new change behaves as intended locally.",
          input: "The change set from T3.",
          action: "Run one focused local verification step.",
          output: "One verification result.",
        }),
        priority: 4,
        type: "test",
        acceptanceCriteria: ["The verification result clearly passes or fails one specific behavior."],
        details: {
          plannerTaskId: "T4",
          goal: "Confirm that the new change behaves as intended locally.",
          input: "The change set from T3.",
          action: "Run one focused local verification step.",
          output: "One verification result.",
          taskSearch: {
            keywords: ["local validation", "focused test"],
            domains: ["testing"],
            intent: "Verify one behavior introduced by the change.",
          },
          validation: "The verification result clearly passes or fails one specific behavior.",
        },
      },
      {
        title: "Record the next handoff state",
        description: buildDescription({
          goal: "Leave the local plan state readable for the next operator or agent.",
          input: "The verified outcome from T4.",
          action: "Write one concise local state update.",
          output: "One documented next action.",
        }),
        priority: 5,
        type: "documentation",
        acceptanceCriteria: [
          "A future operator can identify the next action without re-reading the full session.",
        ],
        details: {
          plannerTaskId: "T5",
          goal: "Leave the local plan state readable for the next operator or agent.",
          input: "The verified outcome from T4.",
          action: "Write one concise local state update.",
          output: "One documented next action.",
          taskSearch: {
            keywords: ["handoff", "local state", "next action"],
            domains: ["documentation"],
            intent: "Document the next actionable state.",
          },
          validation: "A future operator can identify the next action without re-reading the full session.",
        },
      },
    ],
    dependencies: [
      { taskIndex: 1, dependsOnTaskIndex: 0 },
      { taskIndex: 2, dependsOnTaskIndex: 1 },
      { taskIndex: 3, dependsOnTaskIndex: 2 },
      { taskIndex: 4, dependsOnTaskIndex: 3 },
    ],
  };
}

function buildStructuredInput(answers: PlannerAnswer[]): string {
  const lines = ["The user objective, clarification answers, and current repository state."];
  for (const answer of answers) {
    lines.push(`Clarification ${answer.questionId}: ${answer.answer}`);
  }
  return lines.join(" ");
}

function buildProjectSearchHints(goal: string): PlanDraft["details"]["projectSearch"] {
  const keywords = collectSearchKeywords(goal);
  const domains = collectSearchDomains(goal);

  return {
    keywords,
    domains,
    intent: `Find local-first patterns relevant to "${truncate(goal, 72)}".`,
    stackCandidates: ["node.js", "typescript", "better-sqlite3"],
    constraints: ["no mandatory server", "macOS and Linux only"],
  };
}

function collectSearchKeywords(goal: string): string[] {
  const extracted = tokenize(goal)
    .filter((token) => token.length >= 4)
    .filter((token) => !["avec", "this", "that", "pour", "from", "with"].includes(token))
    .slice(0, 3);

  return dedupeStrings([...extracted, "task planning", "cli workflow"]).slice(0, 5);
}

function collectSearchDomains(goal: string): string[] {
  const lowerGoal = normalizeForMatching(goal);
  const domains = ["typescript"];

  if (lowerGoal.includes("sqlite") || lowerGoal.includes("database")) {
    domains.push("sqlite");
  }

  if (lowerGoal.includes("desktop") || lowerGoal.includes("tauri")) {
    domains.push("desktop tooling");
  }

  if (lowerGoal.includes("test")) {
    domains.push("testing");
  }

  if (lowerGoal.includes("api") || lowerGoal.includes("auth") || lowerGoal.includes("oauth")) {
    domains.push("api integration");
  }

  domains.push("terminal tooling");
  return dedupeStrings(domains);
}

function resolveGoal(originalGoal: string, answers: PlannerAnswer[]): string {
  if (answers.length === 0) {
    return originalGoal;
  }

  const clarificationSummary = answers.map((answer) => answer.answer).join("; ");
  return normalizeText(`${originalGoal}. Clarified target: ${clarificationSummary}.`);
}

function buildDescription(input: {
  goal: string;
  input: string;
  action: string;
  output: string;
}): string {
  return [
    `Goal: ${input.goal}`,
    `Input: ${input.input}`,
    `Action: ${input.action}`,
    `Output: ${input.output}`,
  ].join("\n");
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeText(value)).filter((value) => value.length > 0))];
}

function containsTechnicalAnchor(goal: string): boolean {
  const tokens = new Set(tokenize(goal));
  return TECHNICAL_ANCHORS.some((anchor) => tokens.has(anchor));
}

function containsContextlessReference(goal: string): boolean {
  return /\b(this|it|that|ca|cela|ceci|ce)\b/i.test(normalizeForMatching(goal));
}

function tokenize(value: string): string[] {
  return normalizeForMatching(normalizeText(value))
    .split(/[^a-z0-9]+/i)
    .filter((token) => token.length > 0);
}

function detectLanguage(goal: string): "en" | "fr" {
  const tokens = new Set(tokenize(goal));
  return FRENCH_MARKERS.some((marker) => tokens.has(marker)) ? "fr" : "en";
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeForMatching(value: string): string {
  return value.normalize("NFD").replace(/\p{Mark}+/gu, "").toLowerCase();
}

function slugifyProjectId(value: string): string {
  const slug = normalizeForMatching(normalizeText(value))
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "project";
}

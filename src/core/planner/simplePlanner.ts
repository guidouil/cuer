import type { PlanDraft, PlannerInput, PlannerPort } from "../../domain/index.js";

export class SimplePlanner implements PlannerPort {
  createPlan(input: PlannerInput): PlanDraft {
    const goal = normalizeText(input.goal);
    const projectId = slugifyProjectId(input.projectName);

    return {
      planner: "simple-v1",
      summary: `Local execution plan for "${goal}" with an explicit handoff path.`,
      details: {
        assumptions: [
          "Execution stays local-first and terminal-first.",
          "A minimal vertical slice is acceptable before broader automation.",
        ],
        projectSearch: {
          keywords: ["local orchestration", "task planning", "cli workflow"],
          domains: ["typescript", "sqlite", "terminal tooling"],
          intent: "Find local-first planning and task orchestration patterns.",
          stackCandidates: ["node.js", "typescript", "better-sqlite3"],
          constraints: ["no mandatory server", "macOS and Linux only"],
        },
        qualityChecks: {
          allAtomic: true,
          allTestable: true,
          dependenciesExplicit: true,
          noVagueTasks: true,
        },
        sourceProjectId: projectId,
        unknowns: [],
      },
      tasks: [
        {
          title: "Capture the execution slice",
          description: buildDescription({
            goal: `Restate "${goal}" as one concrete local delivery slice.`,
            input: "The user objective and current repository state.",
            action: "Write the smallest implementation target that can be shipped next.",
            output: "One explicit delivery slice statement.",
          }),
          priority: 1,
          type: "analysis",
          acceptanceCriteria: [
            'The delivery slice can be checked without adding new scope.',
          ],
          details: {
            plannerTaskId: "T1",
            goal: `Restate "${goal}" as one concrete local delivery slice.`,
            input: "The user objective and current repository state.",
            action: "Write the smallest implementation target that can be shipped next.",
            output: "One explicit delivery slice statement.",
            taskSearch: {
              keywords: ["scope definition", "delivery slice"],
              domains: ["planning"],
              intent: "Define a minimal execution target.",
            },
            validation: 'The delivery slice can be checked without adding new scope.',
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
            goal: `Create the first code change required to move "${goal}" forward.`,
            input: "The structured plan contract from T2.",
            action: "Implement one isolated runtime change.",
            output: "One inspectable code change set.",
          }),
          priority: 3,
          type: "implementation",
          acceptanceCriteria: [
            "The change can be executed or inspected without hidden dependencies.",
          ],
          details: {
            plannerTaskId: "T3",
            goal: `Create the first code change required to move "${goal}" forward.`,
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
          acceptanceCriteria: [
            "The verification result clearly passes or fails one specific behavior.",
          ],
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

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function slugifyProjectId(value: string): string {
  const slug = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return slug || "project";
}

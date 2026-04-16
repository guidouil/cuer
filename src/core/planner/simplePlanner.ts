import type { PlanDraft, PlannerInput, PlannerPort } from "../../domain/index.js";

export class SimplePlanner implements PlannerPort {
  createPlan(input: PlannerInput): PlanDraft {
    const goal = normalizeGoal(input.goal);

    return {
      planner: "simple-v0",
      summary: `Initial local execution plan for "${goal}".`,
      tasks: [
        {
          title: "Clarify scope and constraints",
          description: `Restate the goal "${goal}" as an executable delivery slice and capture local constraints before any run step is prepared.`,
          priority: 1,
          type: "analysis",
          acceptanceCriteria: [
            "The goal is rewritten as a concrete delivery slice.",
            "Key local constraints and assumptions are explicit.",
          ],
        },
        {
          title: "Model the first execution slice",
          description: `Define the first atomic work units needed to move "${goal}" forward without introducing runner-specific coupling.`,
          priority: 2,
          type: "analysis",
          acceptanceCriteria: [
            "The first execution slice is broken into atomic tasks.",
            "Dependencies between tasks are explicit.",
          ],
        },
        {
          title: "Implement the first usable change set",
          description: `Prepare the code-facing work required to make measurable progress toward "${goal}". Keep the implementation slice isolated and inspectable.`,
          priority: 1,
          type: "code",
          acceptanceCriteria: [
            "A concrete implementation slice is identified.",
            "The slice can later be handed to an external code runner.",
          ],
        },
        {
          title: "Verify the change locally",
          description: `Define the local checks needed to validate the first change set for "${goal}" before review or resume flows are added.`,
          priority: 2,
          type: "test",
          acceptanceCriteria: [
            "Local verification steps are defined.",
            "The expected outcome of each check is explicit.",
          ],
        },
        {
          title: "Review gaps and blockers",
          description: `Inspect the first plan slice for unresolved blockers, missing context, or follow-up work needed to deliver "${goal}" cleanly.`,
          priority: 2,
          type: "review",
          acceptanceCriteria: [
            "Open blockers are listed.",
            "Follow-up work is identified without expanding scope prematurely.",
          ],
        },
        {
          title: "Document state and next actions",
          description: `Record the current plan state for "${goal}" so future run, review, and resume commands can build on explicit local state.`,
          priority: 3,
          type: "docs",
          acceptanceCriteria: [
            "The current state is documented locally.",
            "The next action is unambiguous for a future agent or operator.",
          ],
        },
      ],
      dependencies: [
        { taskIndex: 1, dependsOnTaskIndex: 0 },
        { taskIndex: 2, dependsOnTaskIndex: 1 },
        { taskIndex: 3, dependsOnTaskIndex: 2 },
        { taskIndex: 4, dependsOnTaskIndex: 3 },
        { taskIndex: 5, dependsOnTaskIndex: 4 },
      ],
    };
  }
}

function normalizeGoal(goal: string): string {
  return goal.trim().replace(/\s+/g, " ");
}

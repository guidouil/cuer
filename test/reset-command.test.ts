import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";

import { runResetCommand } from "../src/cli/commands/resetCommand.js";
import { WorkspaceContext } from "../src/core/context/workspaceContext.js";
import { findPendingPlannerInquiry } from "../src/core/planner/pendingPlannerInquiry.js";
import { PlanningService } from "../src/core/planner/planningService.js";
import { writeExecutionResultArtifact, writeRunnerPrompt } from "../src/filesystem/workspace.js";
import { createId } from "../src/utils/id.js";
import { nowIso } from "../src/utils/time.js";

import type { Terminal } from "../src/cli/terminal.js";
import type { PlanDraft } from "../src/domain/index.js";

test("reset command clears persisted workflow state for the current project", async (t) => {
  const rootPath = await createTempDir(t);
  const context = WorkspaceContext.open(rootPath, { autoInitialize: true });

  const { project } = context.ensureProject();
  const planningService = new PlanningService();
  const draft = buildPlanDraft();
  const planningResult = planningService.createPlanFromDraft(context, project, "Add reset command", draft);

  context.repositories.events.create({
    id: createId("event"),
    projectId: project.id,
    planId: null,
    taskId: null,
    type: "planner.questions.generated",
    payload: {
      blockingUnknowns: ["The cleanup command scope is not yet explicit."],
      goal: "Add reset command",
      planner: draft.planner,
      plannerSource: "simple",
      projectSearch: draft.details.projectSearch,
      questions: [
        {
          id: "Q1",
          question: "Should reset also clear generated workflow files?",
          why: "The cleanup scope must be explicit.",
        },
      ],
      sourceProjectId: draft.details.sourceProjectId,
      summary: "Clarify whether generated workflow files should be removed.",
    },
    createdAt: nowIso(),
  });

  const promptPath = writeRunnerPrompt(context.paths, {
    content: "Manual runner prompt",
    taskId: planningResult.tasks[0]!.id,
    taskTitle: planningResult.tasks[0]!.title,
  });
  const artifactPath = writeExecutionResultArtifact(context.paths, {
    artifact: {
      artifactId: createId("artifact"),
      artifactType: "task-execution-result",
      createdAt: nowIso(),
      nextStatus: "done",
      planId: planningResult.plan.id,
      previousStatus: "running",
      projectId: project.id,
      reason: "Completed manually.",
      schemaVersion: 1,
      source: "manual-cli",
      summary: "Completed manually.",
      taskId: planningResult.tasks[0]!.id,
      taskTitle: planningResult.tasks[0]!.title,
    },
  });
  const planSnapshotPath = join(context.paths.plansDir, `${planningResult.plan.id}.json`);
  context.close();

  const terminal = new RecordingTerminal();
  runResetCommand(rootPath, terminal);

  const reopened = WorkspaceContext.open(rootPath);
  t.after(() => {
    reopened.close();
  });

  const reopenedProject = reopened.repositories.projects.findByRootPath(rootPath);
  assert.ok(reopenedProject, "The reset should preserve the project registration.");
  assert.equal(reopened.repositories.plans.findLatestByProjectId(reopenedProject.id), null);
  assert.equal(reopened.repositories.tasks.countByProjectId(reopenedProject.id), 0);

  const recentEvents = reopened.repositories.events.listRecentByProjectId(reopenedProject.id, 20);
  assert.equal(findPendingPlannerInquiry(recentEvents), null);
  assert.ok(recentEvents.every((event) => event.type === "project.registered"));

  assert.equal(existsSync(planSnapshotPath), false);
  assert.equal(existsSync(promptPath), false);
  assert.equal(existsSync(artifactPath), false);

  assert.deepEqual(terminal.errors, []);
  assert.deepEqual(terminal.infos, [
    "Reset complete: 1 plan(s), 2 task(s), 2 event(s) removed.",
    "Files cleared: 1 plan snapshot(s), 1 prompt(s), 1 execution artifact(s).",
  ]);
});

class RecordingTerminal implements Terminal {
  readonly errors: string[] = [];
  readonly infos: string[] = [];

  error(message: string): void {
    this.errors.push(message);
  }

  info(message: string): void {
    this.infos.push(message);
  }

  async prompt(_message: string): Promise<string> {
    throw new Error("Reset command should not prompt.");
  }
}

function buildPlanDraft(): PlanDraft {
  return {
    dependencies: [
      {
        dependsOnTaskIndex: 0,
        taskIndex: 1,
      },
    ],
    details: {
      assumptions: ["The reset command should only affect the current workspace."],
      projectSearch: {
        constraints: ["local-first", "terminal-first"],
        domains: ["typescript", "sqlite"],
        intent: "Add a local reset workflow command.",
        keywords: ["reset", "cleanup"],
        stackCandidates: ["node.js", "better-sqlite3"],
      },
      qualityChecks: {
        allAtomic: true,
        allTestable: true,
        dependenciesExplicit: true,
        noVagueTasks: true,
      },
      request: {
        clarificationAnswers: [],
        originalGoal: "Add reset command",
        resolvedGoal: "Add reset command",
      },
      sourceProjectId: "local-project",
      unknowns: [],
    },
    planner: "test-planner",
    summary: "Reset the local workflow state.",
    tasks: [
      {
        acceptanceCriteria: ["The command removes persisted plan state."],
        description: "Add a workflow reset command.",
        details: {
          action: "Add the reset command entrypoint.",
          goal: "Expose a workflow reset command in the CLI.",
          input: "The current CLI command router.",
          output: "A callable reset command.",
          plannerTaskId: "T1",
          taskSearch: {
            domains: ["typescript"],
            intent: "Add a CLI command.",
            keywords: ["cli", "command"],
          },
          validation: "The command is callable from the CLI.",
        },
        priority: 1,
        title: "Expose the reset command",
        type: "implementation",
      },
      {
        acceptanceCriteria: ["The command clears generated workflow files."],
        description: "Clear plan snapshots and generated execution files.",
        details: {
          action: "Remove the persisted files tied to the current workflow.",
          goal: "Keep the local workspace coherent after a reset.",
          input: "The generated workflow files in .cuer.",
          output: "A clean workspace workflow state.",
          plannerTaskId: "T2",
          taskSearch: {
            domains: ["typescript", "filesystem"],
            intent: "Clear generated workflow files.",
            keywords: ["workspace", "files"],
          },
          validation: "Generated workflow files are removed after reset.",
        },
        priority: 2,
        title: "Clear generated workflow files",
        type: "implementation",
      },
    ],
  };
}

async function createTempDir(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cuer-reset-test-"));
  t.after(async () => {
    await rm(directory, { force: true, recursive: true });
  });
  return directory;
}

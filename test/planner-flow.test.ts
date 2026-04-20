import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import test, { type TestContext } from "node:test";

import { runPlanCommand } from "../src/cli/commands/planCommand.js";
import { runResumeCommand } from "../src/cli/commands/resumeCommand.js";
import { WorkspaceAppService } from "../src/core/app/workspaceAppService.js";
import { WorkspaceContext } from "../src/core/context/workspaceContext.js";

import type { Terminal } from "../src/cli/terminal.js";
import type { PlannerAnswer } from "../src/domain/index.js";

test("internal planner can ask clarifying questions before creating a plan", async (t) => {
  const rootPath = await createTempDir(t);
  const workspaceAppService = new WorkspaceAppService();

  createReadyPlanningAccount(workspaceAppService, rootPath);

  const firstPass = workspaceAppService.runPlanner({
    goal: "continue",
    rootPath,
  });

  assert.equal(firstPass.kind, "questions");
  assert.equal(firstPass.planner, "simple-v2");
  assert.equal(firstPass.inquiry.questions.length, 2);

  const clarificationAnswers = firstPass.inquiry.questions.map<PlannerAnswer>((question) => ({
    answer:
      question.id === "Q1"
        ? "Add a review command to inspect pending plans."
        : "Change the CLI planning flow first.",
    question: question.question,
    questionId: question.id,
  }));

  const secondPass = workspaceAppService.runPlanner({
    clarificationAnswers,
    goal: "continue",
    rootPath,
  });

  assert.equal(secondPass.kind, "plan");
  assert.equal(secondPass.planner, "simple-v2");
  assert.equal(secondPass.plan.details?.request.originalGoal, "continue");
  assert.equal(secondPass.plan.details?.request.clarificationAnswers.length, 2);
  assert.match(secondPass.plan.goal, /Add a review command/i);

  const context = WorkspaceContext.open(rootPath);
  t.after(() => {
    context.close();
  });

  const project = context.repositories.projects.findByRootPath(rootPath);
  assert.ok(project, "The planning flow should create a project record.");

  const events = context.repositories.events.listRecentByProjectId(project.id, 10);
  assert.ok(events.some((event) => event.type === "planner.questions.generated"));
  assert.ok(events.some((event) => event.type === "planner.questions.answered"));
  assert.equal(workspaceAppService.getPendingPlannerInquiry(rootPath), null);
});

test("plan command can continue interactively after planner clarification", async (t) => {
  const rootPath = await createTempDir(t);
  const workspaceAppService = new WorkspaceAppService();
  const terminal = new PromptQueueTerminal([
    "Add a review command to inspect pending plans.",
    "Change the CLI planning flow first.",
  ]);

  createReadyPlanningAccount(workspaceAppService, rootPath);
  withInteractiveTty(t);

  await runPlanCommand(rootPath, ["continue"], terminal);

  assert.ok(
    terminal.infos.some((line) => line.includes("Planner needs clarification before creating a plan.")),
    "The command should surface the clarification step before creating the plan.",
  );
  assert.ok(
    terminal.infos.some((line) => line.startsWith("Plan created: ")),
    "The command should continue through clarification and finish with a created plan.",
  );
  assert.deepEqual(terminal.prompts, ["Answer: ", "Answer: "]);

  const context = WorkspaceContext.open(rootPath);
  t.after(() => {
    context.close();
  });

  const project = context.repositories.projects.findByRootPath(rootPath);
  assert.ok(project, "The CLI flow should create a project.");

  const plan = context.repositories.plans.findLatestByProjectId(project.id);
  assert.ok(plan, "The CLI flow should persist a plan.");
  assert.equal(plan.details?.request.clarificationAnswers.length, 2);
  assert.equal(workspaceAppService.getPendingPlannerInquiry(rootPath), null);
});

test("workspace app can recover a pending planner inquiry from persisted events", async (t) => {
  const rootPath = await createTempDir(t);
  const workspaceAppService = new WorkspaceAppService();

  createReadyPlanningAccount(workspaceAppService, rootPath);

  const result = workspaceAppService.runPlanner({
    goal: "continue",
    rootPath,
  });

  assert.equal(result.kind, "questions");

  const pendingInquiry = workspaceAppService.getPendingPlannerInquiry(rootPath);
  assert.ok(pendingInquiry, "The pending inquiry should be readable after the initial planning pass.");
  assert.equal(pendingInquiry.goal, "continue");
  assert.equal(pendingInquiry.planner, "simple-v2");
  assert.equal(pendingInquiry.inquiry.questions.length, 2);

  const overview = workspaceAppService.getWorkspaceOverview(rootPath);
  const overviewInquiry = overview.projects[0]?.pendingPlannerInquiry ?? null;
  assert.ok(overviewInquiry, "Workspace overview should surface the pending inquiry for desktop reloads.");
  assert.equal(overviewInquiry.goal, "continue");
  assert.equal(overviewInquiry.inquiry.questions.length, 2);
});

test("resume command can continue a persisted local planner inquiry", async (t) => {
  const rootPath = await createTempDir(t);
  const workspaceAppService = new WorkspaceAppService();
  const terminal = new PromptQueueTerminal([
    "Add a review command to inspect pending plans.",
    "Change the CLI planning flow first.",
  ]);

  createReadyPlanningAccount(workspaceAppService, rootPath);
  workspaceAppService.runPlanner({
    goal: "continue",
    rootPath,
  });

  withInteractiveTty(t);
  await runResumeCommand(rootPath, [], terminal);

  assert.ok(
    terminal.infos.some((line) => line.includes("Planner needs clarification before creating a plan.")),
    "The resume command should load the pending clarification state from storage.",
  );
  assert.ok(
    terminal.infos.some((line) => line.startsWith("Plan created: ")),
    "The resume command should complete planning after replaying the saved inquiry.",
  );

  const context = WorkspaceContext.open(rootPath);
  t.after(() => {
    context.close();
  });

  const project = context.repositories.projects.findByRootPath(rootPath);
  assert.ok(project, "The resumed flow should keep the project registered.");

  const plan = context.repositories.plans.findLatestByProjectId(project.id);
  assert.ok(plan, "The resume command should persist a plan.");
  assert.equal(plan.details?.request.clarificationAnswers.length, 2);
  assert.equal(workspaceAppService.getPendingPlannerInquiry(rootPath), null);
});

test("workspace app can resume an external planner inquiry with an imported JSON response", async (t) => {
  const rootPath = await createTempDir(t);
  const workspaceAppService = new WorkspaceAppService();

  createReadyPlanningAccount(workspaceAppService, rootPath);

  const firstPass = workspaceAppService.runPlanner({
    goal: "Continue the external planning round.",
    plannerName: "anthropic:claude",
    plannerResponseJson: externalAskUserPlannerResponse(),
    rootPath,
  });

  assert.equal(firstPass.kind, "questions");
  assert.equal(firstPass.planner, "anthropic:claude");

  const pendingInquiry = workspaceAppService.getPendingPlannerInquiry(rootPath);
  assert.ok(pendingInquiry, "The external inquiry should be persisted for desktop resume.");
  assert.equal(pendingInquiry.planner, "anthropic:claude");

  const secondPass = workspaceAppService.runPlanner({
    clarificationAnswers: firstPass.inquiry.questions.map((question) => ({
      answer: "Keep the first implementation focused on the desktop planner resume flow.",
      question: question.question,
      questionId: question.id,
    })),
    goal: pendingInquiry.goal,
    plannerName: "anthropic:claude",
    plannerResponseJson: externalCreatePlanPlannerResponse(),
    rootPath,
  });

  assert.equal(secondPass.kind, "plan");
  assert.equal(secondPass.plan.planner, "anthropic:claude");
  assert.equal(secondPass.plan.details?.request.clarificationAnswers.length, 1);
  assert.equal(workspaceAppService.getPendingPlannerInquiry(rootPath), null);

  const overview = workspaceAppService.getWorkspaceOverview(rootPath);
  assert.equal(overview.projects[0]?.pendingPlannerInquiry ?? null, null);
});

class PromptQueueTerminal implements Terminal {
  readonly errors: string[] = [];
  readonly infos: string[] = [];
  readonly prompts: string[] = [];

  constructor(private readonly answers: string[]) {}

  error(message: string): void {
    this.errors.push(message);
  }

  info(message: string): void {
    this.infos.push(message);
  }

  async prompt(message: string): Promise<string> {
    this.prompts.push(message);
    const answer = this.answers.shift();
    if (answer === undefined) {
      throw new Error(`Unexpected prompt: ${message}`);
    }

    return answer;
  }
}

function createReadyPlanningAccount(workspaceAppService: WorkspaceAppService, rootPath: string): void {
  workspaceAppService.createProviderAccount({
    authMethodType: "local_endpoint",
    baseUrl: "http://localhost:11434/v1",
    name: "Local Ollama",
    providerType: "ollama",
    rootPath,
  });
}

async function createTempDir(t: TestContext): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "cuer-test-"));
  t.after(async () => {
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

function withInteractiveTty(t: TestContext): void {
  const stdinDescriptor = Object.getOwnPropertyDescriptor(stdin, "isTTY");
  const stdoutDescriptor = Object.getOwnPropertyDescriptor(stdout, "isTTY");

  Object.defineProperty(stdin, "isTTY", {
    configurable: true,
    value: true,
  });
  Object.defineProperty(stdout, "isTTY", {
    configurable: true,
    value: true,
  });

  t.after(() => {
    if (stdinDescriptor) {
      Object.defineProperty(stdin, "isTTY", stdinDescriptor);
    }
    if (stdoutDescriptor) {
      Object.defineProperty(stdout, "isTTY", stdoutDescriptor);
    }
  });
}

function externalAskUserPlannerResponse(): string {
  return JSON.stringify({
    blockingUnknowns: ["The first implementation slice is not explicit enough."],
    mode: "ask_user",
    projectId: "cuer",
    projectSearch: {
      constraints: ["no mandatory server", "desktop shell available"],
      domains: ["typescript", "desktop tooling"],
      intent: "Find planner resume patterns for a local desktop shell.",
      keywords: ["planner resume", "desktop clarification"],
      stackCandidates: ["tauri", "typescript"],
    },
    questions: [
      {
        id: "Q1",
        question: "Quel est le premier livrable concret pour cette reprise planner desktop ?",
        why: "The minimal implementation target must be explicit before planning can continue safely.",
      },
    ],
    summary: "The desktop resume scope needs one explicit first delivery slice.",
  });
}

function externalCreatePlanPlannerResponse(): string {
  return JSON.stringify({
    assumptions: ["The imported planner response is authoritative for this round."],
    mode: "create_plan",
    projectId: "cuer",
    projectSearch: {
      constraints: ["no mandatory server", "desktop shell available"],
      domains: ["typescript", "desktop tooling"],
      intent: "Find planner resume patterns for a local desktop shell.",
      keywords: ["planner resume", "desktop clarification"],
      stackCandidates: ["tauri", "typescript"],
    },
    qualityChecks: {
      allAtomic: true,
      allTestable: true,
      dependenciesExplicit: true,
      noVagueTasks: true,
    },
    summary: "Resume the pending desktop planner clarification round and persist the next plan.",
    tasks: [
      {
        action: "Implement one desktop path that imports a planner JSON response after clarification.",
        dependsOn: [],
        goal: "Allow the desktop shell to continue an external clarification round without falling back to the CLI.",
        id: "T1",
        input: "The pending clarification answers and the imported planner JSON response.",
        output: "One desktop resume flow for external planner responses.",
        projectId: "cuer",
        taskSearch: {
          domains: ["desktop tooling"],
          intent: "Implement the external planner resume path in the desktop shell.",
          keywords: ["desktop resume", "planner import"],
        },
        title: "Implement the desktop external planner resume path",
        type: "implementation",
        validation: "A user can continue an external planner clarification round from the desktop shell.",
      },
    ],
    unknowns: [],
  });
}

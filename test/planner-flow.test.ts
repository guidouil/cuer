import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stdin, stdout } from "node:process";
import test, { type TestContext } from "node:test";

import { runPlanCommand } from "../src/cli/commands/planCommand.js";
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

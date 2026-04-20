#!/usr/bin/env node

import { cwd, execPath } from "node:process";

import { WorkspaceAppService } from "../core/app/workspaceAppService.js";

import type { AuthMethodType, PlannerAnswer, ProviderType } from "../domain/index.js";

const workspaceAppService = new WorkspaceAppService();

void main();

async function main(): Promise<void> {
  try {
    const [command, rootPath = cwd(), ...args] = readBridgeArgs(process.argv);

    switch (command) {
      case "workspace-overview":
        writeJson(workspaceAppService.getWorkspaceOverview(rootPath));
        return;
      case "create-provider-account": {
        const payloadJson = args[0]?.trim();
        if (!payloadJson) {
          throw new Error("A JSON payload is required for create-provider-account.");
        }

        const payload = JSON.parse(payloadJson) as Partial<{
          authMethodType: string;
          baseUrl: string | null;
          defaultModel: string | null;
          name: string;
          providerType: string;
          secretValue: string | null;
        }>;

        if (!payload.authMethodType || !payload.name || !payload.providerType) {
          throw new Error("Provider account payload is incomplete.");
        }

        writeJson(
          workspaceAppService.createProviderAccount({
            authMethodType: payload.authMethodType as AuthMethodType,
            name: payload.name,
            providerType: payload.providerType as ProviderType,
            rootPath,
            ...(payload.baseUrl ? { baseUrl: payload.baseUrl } : {}),
            ...(payload.defaultModel ? { defaultModel: payload.defaultModel } : {}),
            ...(payload.secretValue ? { secretValue: payload.secretValue } : {}),
          }),
        );
        return;
      }
      case "run-planner": {
        const goal = args[0]?.trim() ?? "";
        if (goal.length === 0) {
          throw new Error("A goal is required for run-planner.");
        }

        const clarificationAnswers = parsePlannerAnswers(args[1]);
        writeJson(
          workspaceAppService.runPlanner({
            ...(clarificationAnswers.length > 0 ? { clarificationAnswers } : {}),
            goal,
            rootPath,
          }),
        );
        return;
      }
      default:
        throw new Error(`Unknown desktop bridge command "${command}".`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function parsePlannerAnswers(value: string | undefined): PlannerAnswer[] {
  if (!value) {
    return [];
  }

  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Planner clarification answers must be a JSON array.");
  }

  return parsed.map((entry, index) => {
    if (!entry || typeof entry !== "object") {
      throw new Error(`Planner clarification answer ${index + 1} is invalid.`);
    }

    const questionId = "questionId" in entry ? String(entry.questionId ?? "").trim() : "";
    const question = "question" in entry ? String(entry.question ?? "").trim() : "";
    const answer = "answer" in entry ? String(entry.answer ?? "").trim() : "";

    if (!questionId || !question || !answer) {
      throw new Error(`Planner clarification answer ${index + 1} is incomplete.`);
    }

    return {
      answer,
      question,
      questionId,
    };
  });
}

function readBridgeArgs(argv: string[]): string[] {
  const candidate = argv[1];
  if (candidate && (candidate === argv[0] || candidate === execPath || /\.([cm]?js)$/.test(candidate))) {
    return argv.slice(2);
  }

  return argv.slice(1);
}

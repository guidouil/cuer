#!/usr/bin/env node

import { cwd } from "node:process";

import { WorkspaceAppService } from "../core/app/workspaceAppService.js";

const workspaceAppService = new WorkspaceAppService();

void main();

async function main(): Promise<void> {
  try {
    const [command, rootPath = cwd(), ...args] = process.argv.slice(2);

    switch (command) {
      case "workspace-overview":
        writeJson(workspaceAppService.getWorkspaceOverview(rootPath));
        return;
      case "run-planner": {
        const goal = args.join(" ").trim();
        if (goal.length === 0) {
          throw new Error("A goal is required for run-planner.");
        }

        writeJson(
          workspaceAppService.runPlanner({
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

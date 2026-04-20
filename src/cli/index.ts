#!/usr/bin/env node

import { cwd, exitCode, platform } from "node:process";

import { runAccountsCommand } from "./commands/accountsCommand.js";
import { runAddAccountCommand } from "./commands/addAccountCommand.js";
import { runInitCommand } from "./commands/initCommand.js";
import { runPlanCommand } from "./commands/planCommand.js";
import { runResumeCommand } from "./commands/resumeCommand.js";
import { runRunCommand } from "./commands/runCommand.js";
import { runShowArtifactCommand } from "./commands/showArtifactCommand.js";
import { runShowPlanCommand } from "./commands/showPlanCommand.js";
import { runShowTaskCommand } from "./commands/showTaskCommand.js";
import { runStatusCommand } from "./commands/statusCommand.js";
import { runTaskHistoryCommand } from "./commands/taskHistoryCommand.js";
import { runTasksCommand } from "./commands/tasksCommand.js";
import { runUpdateTaskCommand } from "./commands/updateTaskCommand.js";
import { ConsoleTerminal } from "./terminal.js";

const terminal = new ConsoleTerminal();

void main();

async function main(): Promise<void> {
  try {
    assertSupportedPlatform();

    const [command, ...args] = process.argv.slice(2);
    const rootPath = cwd();

    switch (command) {
      case "init":
        runInitCommand(rootPath, terminal);
        return;
      case "accounts":
        runAccountsCommand(rootPath, terminal);
        return;
      case "add-account":
        await runAddAccountCommand(rootPath, args, terminal);
        return;
      case "plan":
        await runPlanCommand(rootPath, args, terminal);
        return;
      case "resume":
        await runResumeCommand(rootPath, args, terminal);
        return;
      case "tasks":
        runTasksCommand(rootPath, terminal);
        return;
      case "run":
        await runRunCommand(rootPath, args, terminal);
        return;
      case "task-history":
        runTaskHistoryCommand(rootPath, args, terminal);
        return;
      case "show-artifact":
        runShowArtifactCommand(rootPath, args, terminal);
        return;
      case "show-task":
        runShowTaskCommand(rootPath, args, terminal);
        return;
      case "show-plan":
        runShowPlanCommand(rootPath, terminal);
        return;
      case "update-task":
        runUpdateTaskCommand(rootPath, args, terminal);
        return;
      case "status":
        runStatusCommand(rootPath, terminal);
        return;
      case "help":
      case "--help":
      case "-h":
      case undefined:
        printHelp();
        return;
      default:
        throw new Error(`Unknown command "${command}". Run "cuer help" for usage.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    terminal.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}

function assertSupportedPlatform(): void {
  if (platform === "darwin" || platform === "linux") {
    return;
  }

  throw new Error(`Unsupported platform "${platform}". Cuer currently supports macOS and Linux.`);
}

function printHelp(): void {
  terminal.info("Cuer");
  terminal.info("");
  terminal.info("Usage:");
  terminal.info("  cuer init");
  terminal.info("  cuer accounts");
  terminal.info("  cuer add-account --provider <type> --name <label> [--auth <method>] [--base-url <url>] [--secret-env <ENV>]");
  terminal.info('  cuer plan "your objective"');
  terminal.info('  cuer plan --planner-response <file|-> --planner <name> --goal "your objective"');
  terminal.info("  cuer resume [--answers-file <file>] [--planner-response <file>] [--planner <name>]");
  terminal.info("  cuer tasks");
  terminal.info("  cuer run [--task <task-id>]");
  terminal.info("  cuer task-history [--task <task-id>] [--limit <n>]");
  terminal.info("  cuer show-artifact (--task <task-id> | --artifact <artifact-id>)");
  terminal.info("  cuer show-plan");
  terminal.info("  cuer show-task [--task <task-id>]");
  terminal.info("  cuer update-task --status <status> [--task <task-id>] [--reason <text>] [--summary <text>]");
  terminal.info("  cuer status");
}

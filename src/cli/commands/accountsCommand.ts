import { WorkspaceAppService } from "../../core/app/workspaceAppService.js";

import type { Terminal } from "../terminal.js";

const workspaceAppService = new WorkspaceAppService();

export function runAccountsCommand(rootPath: string, terminal: Terminal): void {
  const overview = workspaceAppService.tryGetWorkspaceOverview(rootPath);
  if (!overview) {
    terminal.info(`Workspace: ${rootPath}`);
    terminal.info('No Cuer workspace found yet. Run "cuer init" or "cuer add-account" first.');
    return;
  }

  const accountManager = overview.accountManager;

  terminal.info(`Workspace: ${overview.workspacePath}`);
  terminal.info(`Accounts: ${accountManager.accounts.length}`);

  if (accountManager.projectWorkGateway.isReady) {
    terminal.info(
      `Project gateway: ${accountManager.projectWorkGateway.accountName} (${accountManager.projectWorkGateway.providerLabel})`,
    );
  } else if (accountManager.projectWorkGateway.reason) {
    terminal.info(`Project gateway: ${accountManager.projectWorkGateway.reason}`);
  }

  if (accountManager.accounts.length === 0) {
    terminal.info('No provider accounts configured yet. Run "cuer add-account" first.');
    return;
  }

  for (const account of accountManager.accounts) {
    terminal.info("");
    terminal.info(`${account.name} (${account.providerLabel})`);
    terminal.info(`  Auth: ${account.authMethodType ?? "unconfigured"}`);
    terminal.info(`  Base URL: ${account.baseUrl ?? "default"}`);
    terminal.info(`  Credential: ${account.credentialStatus}${account.secretHint ? ` ${account.secretHint}` : ""}`);
    terminal.info(`  Planning access: ${account.canPlan ? "allowed" : "blocked"}`);
    terminal.info(`  Execution access: ${account.canExecute ? "allowed" : "blocked"}`);
    if (account.defaultModel) {
      terminal.info(`  Default model: ${account.defaultModel}`);
    }
  }
}

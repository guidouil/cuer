# Account Manager Milestone

## Added

- A shared Account Manager domain in `src/domain/account.ts`
- Shared core account services in `src/core/accounts/`
- SQLite tables and repositories for accounts, auth methods, credentials, usage events, cost records, and access policies
- A dedicated secret-store abstraction with the default OS keychain implementation in `src/integrations/secrets/osKeychainSecretStore.ts`
- A legacy filesystem secret store in `src/filesystem/secretStore.ts` for compatibility and migration
- Desktop account management as the first visible workflow
- CLI commands for `accounts` and `add-account`

## Reused

- `WorkspaceContext` for local workspace bootstrap and composition
- Existing SQLite database wiring and repository pattern
- Existing planner core and manual runner
- Existing desktop bridge and Tauri shell

## Gateway rule

Planner and run flows now resolve provider access through the Account Manager first.

Current behavior:

- `cuer plan` requires a configured account gateway
- `cuer run` requires a configured account gateway
- the desktop planner view remains secondary to the Account Manager

## Secret handling

- Secret material is not stored in `config.json`
- Secret material is stored through `SecretStore`
- New secrets are written to the OS keychain on macOS and Linux
- Legacy `.cuer/secrets/` files are read for compatibility and migrated forward on access
- The UI and overview DTOs only return redacted hints, not raw secrets

## Still stubbed

- Real provider-backed usage and cost recording from planner/execution adapters
- Explicit multi-account selection beyond the current default resolved gateway
- Rich policy authoring beyond the default allow policy scaffold

## Run instructions

CLI:

```bash
npm install
npm run dev -- init
OPENAI_API_KEY=your_key_here npm run dev -- add-account --provider openai --name "Primary OpenAI" --auth api_key --secret-env OPENAI_API_KEY
npm run dev -- accounts
npm run dev -- plan "Ship a first local workflow for task orchestration"
```

Desktop:

```bash
npm install
npm run tauri:dev
```

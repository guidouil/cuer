# Cuer

Cuer is a local-first orchestrator for agentic development.

It is not a chatbot, not a thin planner, and not an IDE. The current foundation is an account-first workflow: provider accounts, auth methods, secrets, access policies, and usage accounting live in the shared core before project planning or task execution begin.

The repository now also includes a Tauri desktop shell that reuses the same Node.js/TypeScript core services instead of rebuilding business logic in the frontend.

## Current scope

V0 provides:

- a Node.js + TypeScript CLI
- local project workspace bootstrap in `.cuer/`
- a local SQLite database powered by `better-sqlite3`
- a shared Account Manager domain for providers, auth methods, credentials, access policies, usage events, and cost records
- an OS keychain-backed secret storage abstraction
- explicit domain entities for projects, plans, tasks, task dependencies, and events
- account-gated planner and run flows that resolve provider access through the shared core
- a provider-backed planner that executes `prompts/planner.md` through the configured planning account model
- ingestion of strict external planner JSON responses compatible with `prompts/planner.md`
- a task lifecycle engine that validates state transitions and keeps queue readiness synchronized
- a first `run` command wired to an external runner port with a local manual handoff implementation
- an explicit `update-task` command to report execution outcomes back into local state
- a structured execution result artifact written locally under `.cuer/artifacts/`
- a `task-history` command to inspect execution feedback without reading SQLite or JSON manually
- a `show-artifact` command to inspect one execution artifact in detail
- a `show-task` command to inspect one task with state, dependencies, prompt, events, and artifacts
- a `show-plan` command to inspect the current task graph with dependencies and latest artifacts
- a `resume` command to continue the latest pending planner clarification round from persisted local state

## Prerequisites

- Node.js 20 or newer
- npm
- macOS or Linux
- on Linux, `secret-tool` from `libsecret` for account secrets

## Installation

```bash
npm install
```

For the desktop app, you also need a working Rust toolchain because Tauri builds a native shell.

For development without building:

```bash
npm run dev -- help
```

For a real local CLI install without publishing, use a user-local npm prefix:

```bash
npm install
npm run install:local
export PATH="$HOME/.local/bin:$PATH"
cuer help
```

`npm run install:local` installs the current repository as a local global package under `~/.local/` and exposes the `cuer` binary from there. To install into another prefix, set `CUER_NPM_PREFIX` before running the command.

## Available commands

```bash
cuer init [project-dir]
cuer accounts
cuer add-account --provider openai --name "Primary OpenAI" --auth api_key --secret-env OPENAI_API_KEY
cuer plan "Ship a first local workflow for task orchestration"
cuer plan --planner-response planner-result.json --planner anthropic:claude --goal "Ship a first local workflow for task orchestration"
cuer resume
cuer tasks
cuer run
cuer task-history
cuer show-artifact --task <task-id>
cuer show-plan
cuer show-task --task <task-id>
cuer update-task --status done --summary "Scope clarified and constraints captured"
cuer status
```

Equivalent dev usage:

```bash
npm run dev -- init [project-dir]
npm run dev -- accounts
npm run dev -- add-account --provider openai --name "Primary OpenAI" --auth api_key --secret-env OPENAI_API_KEY
npm run dev -- plan "Ship a first local workflow for task orchestration"
npm run dev -- plan --planner-response planner-result.json --planner anthropic:claude --goal "Ship a first local workflow for task orchestration"
npm run dev -- resume
npm run dev -- tasks
npm run dev -- run
npm run dev -- task-history
npm run dev -- show-artifact --task <task-id>
npm run dev -- show-plan
npm run dev -- show-task --task <task-id>
npm run dev -- update-task --status done --summary "Scope clarified and constraints captured"
npm run dev -- status
```

## Account-first flow

The intended order is now:

1. `cuer init [project-dir]`
2. `cuer add-account ...`
3. `cuer plan ...`
4. `cuer run`

The desktop app follows the same rule and opens on the Account Manager screen first.

## Desktop app

Run the first desktop milestone with:

```bash
npm run tauri:dev
```

That command:

- builds the shared Node.js/TypeScript core into `dist/`
- starts the Vite desktop frontend
- starts the Tauri native shell

On the first run, Tauri may take longer while Cargo compiles the desktop dependencies.

The desktop app currently provides:

- a project-root switcher for multiple local `.cuer/` workspaces
- controls to add an existing Cuer project directory or initialize `.cuer/` in a new project directory through the native folder picker
- an Account Manager screen as the first visible workflow
- listing of configured provider accounts with auth mode, base URL, access status, and redacted secret hints
- a form to register provider accounts, auth type, base URL, API key or placeholder auth data, and an optional default model
- a usage and cost panel backed by local persistence placeholders
- a planner screen gated by the Account Manager
- planner results rendered as clarification questions or a task list
- a clarification follow-up form that can continue planning inside the desktop shell
- pending planner clarifications restored from persisted local state after reopening the desktop app
- an explicit resume action in the project view when a planner clarification round is pending
- import of a fresh external planner JSON response directly in the desktop clarification flow
- a raw backend response panel for debugging

## Desktop architecture

Reused:

- `src/core/planner/*` for plan creation and planner JSON parsing
- `src/core/context/workspaceContext.ts` for local workspace/bootstrap behavior
- `src/db/*` and `src/filesystem/*` for persistence and local state
- the CLI `plan` behavior, now routed through the same shared service as desktop
- the existing manual runner and planner core, now gated through account resolution first

Added:

- `src/core/accounts/*` for provider catalog, account registration, access resolution, and usage summaries
- `src/core/app/workspaceAppService.ts` as the shared application service for CLI and desktop
- `src/desktop/bridgeCli.ts` as a thin Node bridge that exposes JSON to the Tauri shell
- `src/integrations/secrets/osKeychainSecretStore.ts` as the OS keychain-backed secret storage implementation
- `src-tauri/` as the native desktop entrypoint
- `desktop/` as the minimal frontend UI, including the local project-root switcher state

See [docs/account-manager-milestone.md](/Users/gui/Projects/cuer/docs/account-manager-milestone.md) for the milestone note.

## Workspace layout

After `cuer init`, the requested project directory receives:

```text
.cuer/
  cuer.db
  config.json
  plans/
  artifacts/
  logs/
  prompts/
  skills/
```

- `cuer.db`: local state store
- `config.json`: workspace-local configuration
- `plans/`: inspectable plan snapshots written as JSON
- `artifacts/`: execution artifacts and future run outputs
- `logs/`: reserved for future execution logs
- `prompts/`: generated task handoff prompts written during `cuer run`
- `skills/`: reserved for future local skill data

## Repository structure

```text
src/
  cli/
    commands/
  core/
    accounts/
    app/
    planner/
    graph/
    queue/
    context/
    run/
    review/
  desktop/
  db/
    schema/
    repositories/
  filesystem/
  domain/
  integrations/
  utils/
prompts/
desktop/
src-tauri/
```

## Command behavior

### `cuer init [project-dir]`

- creates `.cuer/` in the current directory or in `project-dir`
- creates `config.json`
- creates `cuer.db`
- applies the initial SQLite schema
- prepares the Account Manager foundation without creating a project yet

Other commands recover the nearest existing `.cuer/` by walking upward from the current directory, so running `cuer status`, `cuer plan`, or `cuer run` from a project subdirectory uses the project-level workspace instead of creating nested state.

### `cuer accounts`

- lists configured provider accounts
- shows the currently resolved project gateway when available
- reports redacted credential status only

### `cuer add-account`

- registers one provider account in the shared Account Manager domain
- validates provider type, auth method, and base URL requirements
- writes secret material through the dedicated secret-store abstraction
- persists access policy, credential metadata, and future usage/cost scaffolding

### `cuer plan`

- accepts a goal as arguments or prompts for it
- initializes the workspace if missing
- requires the Account Manager to resolve a planning gateway first
- creates the project record if needed
- sends the goal plus `prompts/planner.md` to the configured planning account model by default
- lets the configured planner ask for clarification first when the goal is too underspecified
- continues interactively in the CLI when clarification answers are needed and the session is attached to a TTY
- persists the returned atomic task graph when the planner chooses `create_plan`
- accepts `--planner-response <file>` or `--planner-response -` to ingest a strict external JSON response
- accepts `--planner <name>` to record the provider or planner label used for the external response
- validates the external response against the `prompts/planner.md` schema before persisting anything
- renders clarification questions when the external response is in `ask_user` mode
- stores the plan, tasks, dependencies, and events in SQLite
- writes a JSON snapshot to `.cuer/plans/`

### `cuer resume`

- reloads the latest pending planner inquiry from persisted workspace events
- resumes account-backed clarification rounds without requiring the original interactive shell
- prompts for answers in a TTY, or accepts `--answers-file <file>` with JSON answers keyed by question id
- accepts `--planner-response <file>` and `--planner <name>` when the pending inquiry came from an external planner
- records clarification answers and either creates the plan or stores a new pending inquiry round

### `cuer tasks`

- lists tasks for the latest plan
- shows status, priority, type, and dependencies

### `cuer run`

- selects the first ready task, or a specific one via `--task`
- requires the Account Manager to resolve an execution gateway first
- validates the task transition through the lifecycle engine
- dispatches the task to the configured runner port
- writes a manual handoff prompt under `.cuer/prompts/`
- marks the task as `running`
- updates plan status and queue availability consistently

### `cuer status`

- shows account and gateway status first
- shows the current project summary when one exists
- reports the latest plan, queue counts, and recent events

### `cuer task-history`

- lists recent structured execution reports for the current project
- accepts `--task` to filter on one task
- accepts `--limit` to control how many entries are shown
- resolves the linked execution artifact and displays a readable summary

### `cuer show-artifact`

- shows one execution artifact in detail
- accepts either `--task` to resolve the latest artifact for that task, or `--artifact` to resolve one explicit artifact id
- reads the linked artifact JSON and renders its metadata in a readable format

### `cuer show-plan`

- shows the latest plan in a consolidated view
- renders task ids, statuses, dependencies, and the latest known artifact summary per task
- includes a queue summary and a compact artifact reference section

### `cuer show-task`

- shows one task in a consolidated view
- accepts `--task`, or falls back to the single running task when that is unambiguous
- renders current state, dependencies, dependents, recent events, latest run prompt, and latest artifacts

### `cuer update-task`

- updates a task through the lifecycle engine
- targets the single running task by default, or a specific task via `--task`
- requires `--status`
- accepts an optional `--reason`
- accepts an optional `--summary`
- writes a structured execution result artifact under `.cuer/artifacts/execution-results/`
- records a dedicated `task.execution.reported` event with artifact metadata
- updates plan status and queue availability consistently

## Data model

V0 persists the following entities:

- `Account`
- `AuthMethod`
- `Credential`
- `UsageEvent`
- `CostRecord`
- `AccessPolicy`
- `Project`
- `Plan`
- `Task`
- `TaskDependency`
- `Event`

Task statuses:

- `draft`
- `ready`
- `blocked`
- `running`
- `done`
- `failed`

Task types:

- `clarification`
- `analysis`
- `implementation`
- `test`
- `documentation`
- `deployment`

## Structured planner JSON

`prompts/planner.md` defines a provider-neutral contract. Cuer only expects valid JSON that matches that schema; it does not depend on any provider SDK.

Bundled prompt contracts live under `prompts/` at the repository root. Runtime handoff prompts generated for task execution live under `.cuer/prompts/`.

Recommended flow:

1. Configure a planning account with a default model.
2. Run `cuer plan "Your objective"`.
3. Cuer sends the goal, clarification answers, and `prompts/planner.md` to the configured model and persists the returned `ask_user` or `create_plan` result.

Manual import flow:

1. Send the user request plus `prompts/planner.md` to the provider of your choice.
2. Force a JSON-only response.
3. Save the response to a file, or pipe it to stdin.
4. Ingest it with:

```bash
cuer plan --planner-response planner-result.json --planner openai:gpt-5 --goal "Your objective"
```

Or:

```bash
provider-wrapper ... | cuer plan --planner-response - --planner mistral:large --goal "Your objective"
```

If the response mode is `create_plan`, Cuer persists the plan and task graph.
If the response mode is `ask_user`, Cuer prints the blocking questions and records the inquiry event locally.

## Limits of V0

- provider-backed usage and cost writes are scaffolded, but the current planner and manual runner do not emit full real provider accounting yet
- the planner depends on a configured account model or an imported external JSON response; it does not include a heuristic local fallback anymore
- the current runner is a manual external handoff, not a live agent execution backend
- no `review` command yet
- no TUI or local UI yet
- no remote sync, cloud service, or multi-user workflow

## Next steps

- record real provider usage and cost events from provider-backed planner and execution adapters
- add explicit account selection and richer policy controls on top of the current default gateway
- add richer runner adapters for external coding agents
- add execution queue operations beyond single-task dispatch
- add richer review flows and broader resume coverage beyond planner clarification
- add a terminal UI only when the command model is stable

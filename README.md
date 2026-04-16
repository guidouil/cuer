# Cuer

Cuer is a local-first orchestrator for agentic development.

It is not a chatbot, not a thin planner, and not an IDE. The first delivery focuses on a terminal workflow that can turn a development objective into a local plan, persist that state in SQLite, and prepare the architecture for `run`, `review`, and `resume` commands.

## Current scope

V0 provides:

- a Node.js + TypeScript CLI
- local workspace bootstrap in `.cuer/`
- a local SQLite database powered by `better-sqlite3`
- explicit domain entities for projects, plans, tasks, task dependencies, and events
- a simple isolated planner that generates an honest initial task graph
- a task lifecycle engine that validates state transitions and keeps queue readiness synchronized
- a first `run` command wired to an external runner port with a local manual handoff implementation
- an explicit `update-task` command to report execution outcomes back into local state
- a structured execution result artifact written locally under `.cuer/artifacts/`
- a `task-history` command to inspect execution feedback without reading SQLite or JSON manually
- a `show-artifact` command to inspect one execution artifact in detail
- a `show-task` command to inspect one task with state, dependencies, prompt, events, and artifacts

## Prerequisites

- Node.js 20 or newer
- npm
- macOS or Linux

## Installation

```bash
npm install
npm run build
```

For development without building:

```bash
npm run dev -- help
```

## Available commands

```bash
cuer init
cuer plan "Ship a first local workflow for task orchestration"
cuer tasks
cuer run
cuer task-history
cuer show-artifact --task <task-id>
cuer show-task --task <task-id>
cuer update-task --status done --summary "Scope clarified and constraints captured"
cuer status
```

Equivalent dev usage:

```bash
npm run dev -- init
npm run dev -- plan "Ship a first local workflow for task orchestration"
npm run dev -- tasks
npm run dev -- run
npm run dev -- task-history
npm run dev -- show-artifact --task <task-id>
npm run dev -- show-task --task <task-id>
npm run dev -- update-task --status done --summary "Scope clarified and constraints captured"
npm run dev -- status
```

## Workspace layout

After `cuer init`, the current directory receives:

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
- `logs/`, `prompts/`, `skills/`: reserved for later execution flows

## Repository structure

```text
src/
  cli/
    commands/
  core/
    planner/
    graph/
    queue/
    context/
    run/
    review/
  db/
    schema/
    repositories/
  filesystem/
  domain/
  integrations/
  utils/
```

## Command behavior

### `cuer init`

- creates `.cuer/`
- creates `config.json`
- creates `cuer.db`
- applies the initial SQLite schema
- registers the local project in the database

### `cuer plan`

- accepts a goal as arguments or prompts for it
- initializes the workspace if missing
- creates the project record if needed
- generates a simple initial plan with atomic tasks
- stores the plan, tasks, dependencies, and events in SQLite
- writes a JSON snapshot to `.cuer/plans/`

### `cuer tasks`

- lists tasks for the latest plan
- shows status, priority, type, and dependencies

### `cuer run`

- selects the first ready task, or a specific one via `--task`
- validates the task transition through the lifecycle engine
- dispatches the task to the configured runner port
- writes a manual handoff prompt under `.cuer/prompts/`
- marks the task as `running`
- updates plan status and queue availability consistently

### `cuer status`

- shows the current project summary
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

- `analysis`
- `code`
- `test`
- `docs`
- `review`

## Limits of V0

- the planner is heuristic and deliberately simple
- the current runner is a manual external handoff, not a live agent execution backend
- no `review` or `resume` command yet
- no TUI or local UI yet
- no remote sync, cloud service, or multi-user workflow

## Next steps

- add richer runner adapters for external coding agents
- add execution queue operations beyond single-task dispatch
- add richer review and resume flows
- add a terminal UI only when the command model is stable

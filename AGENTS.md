# AGENTS

This repository is intentionally small and local-first. Future agents must preserve that.

## Architectural rules

- Keep a strict boundary between `src/cli` and the domain/core layers.
- Do not make the core depend on terminal I/O.
- Keep SQLite local-first through the dedicated `src/db` layer.
- Keep filesystem concerns in `src/filesystem`.
- Keep domain types explicit in `src/domain`.
- Prefer small repositories with readable SQL over ORM-heavy abstractions.
- Preserve modular seams for future external agent runners without stubbing fake integrations.
- Keep runner-specific code behind ports in `src/core` and implementations in `src/integrations`.

## Product constraints

- Terminal first.
- Node.js + TypeScript only.
- `better-sqlite3` for local persistence.
- macOS and Linux only for now.
- Open source, no mandatory server.
- No React, no web framework, no premature UI layer.
- No cloud sync, no auth, no multi-user scope.

## Change discipline

- Prefer small, verifiable changes.
- Do not introduce frameworks or infrastructure that the current scope does not need.
- Do not break the separation between CLI, core, db, filesystem, and integrations.
- Do not replace SQLite or add a remote database.
- Do not add hidden magic or verbose enterprise scaffolding.
- Keep comments sparse and useful.

## Execution expectations

- Validate behavior locally when changing runtime code.
- Keep new dependencies justified and minimal.
- Keep the planner honest: simple is fine, fake intelligence is not.
- Favor inspectable local state and clear failure modes.

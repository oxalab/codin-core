# Repository Guidelines

## Project Structure & Module Organization
- `index.core.ts` is the main entry point for the terminal UI app.
- `src/` holds core TypeScript modules: `agent/`, `cli/`, `memory/`, `runtime/`, `tools/`, `types/`, `utils/`.
- `tui/` contains terminal UI components and assets.
- `tests/` contains test suites (currently `tests/parity/`).
- Supporting material lives in `configs/`, `constants/`, `models/`, `prompts/`, `reference/`, `specs/`, and `migration_docs/`.
- Environment defaults are documented in `.env.example`.

## Build, Test, and Development Commands
- `bun install` installs dependencies.
- `bun run dev` runs the app locally via `index.core.ts` (interactive TUI).
- `bun test` runs the Bun test runner for all tests in `tests/`.

## Coding Style & Naming Conventions
- Language: TypeScript (ESNext modules, `strict: true`).
- Indentation: 2 spaces.
- Strings: double quotes are standard in existing files.
- File naming: `.ts` files; directories use lower-case names (see `src/`).
- Prefer small, focused modules; export types through `src/types/` when shared.

## Testing Guidelines
- Framework: Bun test runner (`bun test`).
- Place tests under `tests/` and mirror module names when possible.
- Use descriptive test names: `describe("runtime scheduler", ...)` / `it("handles retries", ...)`.
- If adding new behavior, add or update tests in `tests/` to cover it.

## Commit & Pull Request Guidelines
- This branch currently has no commits, so no established commit message convention exists.
- Recommended: short, imperative subject lines (e.g., `Add tool registry`).
- PRs should include a concise description of changes and intent.
- PRs should include steps to run or verify (`bun run dev`, `bun test`).
- PRs should include screenshots or recordings for TUI changes when visual behavior changes.

## Configuration & Security Notes
- Do not commit secrets; use `.env.example` as the template.
- Keep configuration files in `configs/` and document new keys in the relevant README or spec.

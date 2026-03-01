# Repository Inventory

## Core Python Modules

- Agent orchestration: `src/codin/agent/`
- Tools: `src/codin/tools/`
- Runtime loaders and persistence: `src/codin/runtime/`
- CLI: `src/codin/cli/cli.py`
- TUI: `src/codin/tui/`
- Utility helpers: `src/codin/utils/`

## Specs and Config Inputs

- Tool schema: `specs/tool_schemas/tools.json`
- Permission rules: `specs/permission_rules/permission_rules.json`
- Permission decision notes: `specs/permission_rules/decision_table.md`
- TODO schema: `specs/todo_schema.json`
- Default settings: `configs/default_setting.json`
- Prompts: `prompts/system_prompt.txt`, `prompts/subagent_prompt.txt`, `prompts/assistant_prompt_template.txt`

## Tests Present

- `tests/unit/test_rebuild_mode.py` has concrete checks.
- Several test files are placeholders/empty and should not be treated as coverage.

## Entry Points

- `main.py` launches TUI app (`codin.tui.app.main`).
- CLI entry function: `src/codin/cli/cli.py:run_cli`.

## Function/Type Inventory

- Full generated inventory: `migration_docs/generated/function_inventory.json`.
- Use this artifact to ensure each class/function has a TS destination or explicit deprecation note.


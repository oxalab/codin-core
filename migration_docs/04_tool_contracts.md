# Tool Contracts

## Authoritative Inputs

- Schema source: `specs/tool_schemas/tools.json`
- Runtime registration source: `src/codin/agent/tool_executor.py`
- Implementations: `src/codin/tools/*.py`
- Schema/impl mismatch report: `migration_docs/generated/tool_schema_vs_impl_report.json`

## Registered Tools In Executor

- `read_file`
- `write_file`
- `list_files`
- `grep`
- `bash` (mapped to function `bash_runner`)
- `edit_file`
- `multi_edit`
- `search_and_replace`
- `git_status`
- `git_diff`
- `todo_write`
- `task`
- `copy_file`
- `move_file`
- `delete_file`
- `create_directory`
- `compress`
- `extract`
- Rebuild toolchain:
  - `rebuild_init`
  - `capture_site`
  - `extract_design_tokens`
  - `extract_component_map`
  - `harvest_assets`
  - `generate_code`
  - `visual_diff`
  - `auto_fix_pass`
  - `rebuild_finalize`

## Function Signature Baseline (Implementation)

- `read_file(path, working_directory?)`
- `write_file(path, contents, create_if_missing?, working_directory?)`
- `list_files(path?, recursive?, include_hidden?, working_directory?)`
- `grep(pattern, path?, recursive?, case_sensitive?, working_directory?)`
- `bash_runner(command, timeout_seconds?, working_directory?)`
- `edit_file(path, patch, working_directory?)`
- `multi_edit(edits, commit_message?, working_directory?)`
- `search_and_replace(path, search, replace, regex?, case_sensitive?, working_directory?)`
- `git_status(working_directory?)`
- `git_diff(path?, working_directory?)`
- `todo_write(operation, todos?, todo_id?, content?, status?, assignee?, state?)`
- `task(task, context?, task_type?, subagent_manager?)`
- `copy_file(source, destination, recursive?, overwrite?, working_directory?)`
- `move_file(source, destination, overwrite?, working_directory?)`
- `delete_file(path, recursive?, force?, working_directory?)`
- `create_directory(path, parents?, exist_ok?, working_directory?)`
- `compress(sources, destination, format?, working_directory?)`
- `extract(source, destination?, overwrite?, working_directory?)`
- Rebuild functions use `run_id`, `output_dir`, `working_directory` plus step-specific args.

## Schema vs Implementation Mismatches (Must Decide)

1. `edit_file`
- Schema expects `old_string`, `new_string`, `replace_all`.
- Implementation expects `patch`.
- Action: choose compatibility strategy:
  - Option A: TS preserves current implementation and add adapter from old/new schema.
  - Option B: TS changes implementation; then also patch Python for parity before migration.

2. `search_and_replace`
- Schema names: `search_pattern`, `replace_pattern`, `use_regex`.
- Implementation names: `search`, `replace`, `regex`, `case_sensitive`.
- Action: define canonical names and adapter.

3. `grep`
- Schema includes `case_insensitive`, `include_hidden`, `max_results`.
- Implementation supports `case_sensitive` only; ignores the others.
- Action: preserve current behavior for parity phase, then add missing features in hardening phase.

4. `git_diff`
- Schema includes `staged`; implementation ignores `staged`.
- Action: parity phase should preserve ignore behavior unless Python is updated first.

## Rebuild Pipeline Contract

Order expected by mode prompt:

1. `rebuild_init`
2. `capture_site`
3. `extract_design_tokens` + `extract_component_map` + `harvest_assets`
4. `generate_code`
5. `visual_diff`
6. `auto_fix_pass`
7. `rebuild_finalize`

Each step writes run artifacts under `<output_dir>/<run_id>/` and updates `manifest.json`.


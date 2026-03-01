# Session Persistence Contract

## Storage Model

Source: `src/codin/runtime/session_persistence.py`

- Default storage dir: `~/.codin/sessions`
- Session file: `<session_id>.json`
- Index file: `sessions_index.json`

## Stored Data

Top-level session file:

- `session_id`
- `name`
- `description`
- `created_at`
- `updated_at`
- `state`

Serialized state:

- `messages`
- `todos`
- `working_directory`
- `permission_rules`
- `tool_execution_log`
- `ui_state`
- `token_usage`
- `performance_metrics`
- `dry_run_code` (note key name mismatch; see known gaps)

## Public APIs To Port

- `save_session`
- `load_session`
- `list_sessions`
- `delete_session`
- `get_session_metadata`
- `export_session(format=json|markdown)`
- `import_session`
- `cleanup_old_session`

## Compatibility Requirement

TS implementation must be able to:

- Read existing Python session files.
- Write either:
  - same shape for in-place compatibility, or
  - versioned shape with migration adapters.

## Known Defects In Current Python

See `migration_docs/11_known_gaps_and_bug_compatibility.md`; decide bug-for-bug parity vs staged fixes before cutover.


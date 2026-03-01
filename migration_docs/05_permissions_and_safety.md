# Permissions And Safety

## Core Engine

Source: `src/codin/agent/permission_engine.py`

Decisions:

- `allow`
- `deny`
- `prompt`

Risk levels:

- `low`
- `medium`
- `high`
- `critical` (note: code currently spells enum value as `CRTICIAL`; preserve/normalize intentionally)

## Decision Flow

1. Identify affected files from tool arguments.
2. Classify risk.
3. Apply explicit `SessionState.permission_rules` first.
4. Auto-allow read-only tools:
   - `read_file`, `list_files`, `grep`, `git_status`, `git_diff`
5. Medium/high/critical require approval callback; if absent, return `prompt`.

## Rule Inputs

- Persistent rules file: `specs/permission_rules/permission_rules.json`
- Default behavior in file indicates deny + prompt by default.

## Safety-Relevant Behaviors To Preserve

- Path-glob matching with `fnmatch`.
- `bash` heuristic detection for dangerous commands (`rm -rf`, `sudo`, etc).
- Sensitive path patterns influence risk level (`.env`, workflow files, lock/manifests).

## TS Port Requirements

- Preserve current decision ordering.
- Preserve callback shape (`PermissionRequest` includes `tool_name`, `arguments`, `affected_files`, `risk_level`, optional `diff_preview`).
- Preserve behavior when callback is missing (`prompt`).


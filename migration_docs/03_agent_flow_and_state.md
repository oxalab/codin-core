# Agent Flow And State

## Primary State Types (Python)

Source: `src/codin/agent/state.py`

- `MessageRole`: `user | assistant | system | tool`
- `Message`: `role`, `content`, optional `tool_calls`, `tool_call_id`, `name`
- `Todo`: `id`, `content`, `status`, optional `assignee`
- `ToolExecution`: `tool_name`, `arguments`, `result`, `timestamp`, `success`, optional `error`
- `PermissionRule`: `id`, `tool`, `path_glob`, `allow`, `description`, `persistent`
- `SessionState`:
  - `messages`, `todos`, `working_directory`, `permission_rules`, `tool_execution_log`
  - `ui_state`, `token_usage`, `performance_metrics`, `dry_run_mode`, `mode`

## Orchestrator Loop

Source: `src/codin/agent/orchestrator.py`

1. User input appended as `Message(role=user)`.
2. Loop up to `max_iterations` (default `50`).
3. LLM called with current messages + active tools + prompt.
4. Assistant message appended.
5. If tool calls present:
   - Permission check per tool call.
   - Inject `state` for `todo_write`.
   - Inject `subagent_manager` for `task`.
   - Execute tool via `ToolExecutor` (optionally under retry manager).
   - Append tool result message.
   - Continue loop.
6. Stop when finish reason is `stop` or `end_turn`.
7. On max iterations, append system warning message.

## Modes

- Default mode excludes rebuild tool set.
- Rebuild mode includes all tools and appends rebuild prompt suffix.
- APIs:
  - `set_mode("default" | "rebuild")`
  - `get_mode()`

## Callback Surfaces

- `set_message_callback`
- `set_tool_call_callback`
- `set_tool_result_callback`
- `set_approval_callback`

## TS Port Requirements

- Preserve loop ordering and message append semantics exactly.
- Preserve tool argument injection behavior for `todo_write` and `task`.
- Preserve `max_iterations` cutoff behavior.


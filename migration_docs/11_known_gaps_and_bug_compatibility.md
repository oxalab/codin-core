# Known Gaps And Bug-Compatibility Notes

This list is derived from current source and must be triaged before migration:

- `src/codin/runtime/session_persistence.py`: `_save_index` opens index file with mode `'r'` but writes JSON to it.
- `src/codin/runtime/session_persistence.py`: `generate_session_id` uses `str(uuid.uuid4)[:8]` instead of calling `uuid4()`.
- `src/codin/runtime/session_persistence.py`: `_serialize_todo` writes `"status": todo.content`.
- `src/codin/runtime/session_persistence.py`: `_serialize_state` calls `_serialize_permission_rule` but function is named `_serialize_permission_rules`.
- `src/codin/runtime/session_persistence.py`: `_serialize_state` uses key `dry_run_code`, deserializer expects `dry_run_mode`.
- `src/codin/runtime/session_persistence.py`: `export_session` uses `metadata.to_dict` instead of `metadata.to_dict()`.
- `src/codin/runtime/session_persistence.py`: markdown exporter has `lines.appeng(...)` typo.
- `src/codin/runtime/session_persistence.py`: `delete_session` has no explicit `False` return for not-found path.

- `src/codin/agent/context_manager.py`: `FileCacheEntry` field types for `token_count` and `last_accessed` are string-like but used numerically.
- `src/codin/agent/context_manager.py`: `summarize_old_messages` computes `summary_content` but ignores it.
- `src/codin/agent/context_manager.py`: `get_cached_file` checks `entry.current_hash` (field does not exist; likely `content_hash`).

- `src/codin/agent/permission_engine.py`: enum value typo `CRTICIAL`; logic uses same typo.
- `src/codin/agent/tool_executor.py`: `self.tool_registry` vs `self._tool_registry` inconsistency.
- `src/codin/agent/tool_executor.py`: import failure silently swallowed; registry may be undefined.
- `src/codin/agent/tool_executor.py`: mutates incoming `arguments` dict in-place.

- `src/codin/tools/delete_file.py`: directory delete count uses `if target_path.is_file()` inside rglob loop, likely always `False`.
- `src/codin/tools/search_and_replace.py`: no-match response uses key `replacement` (singular) while success uses `replacements`.
- `src/codin/tools/git_tools.py`: schema has `staged`, function ignores it.

- `src/codin/agent/llm_gateway.py`: OpenRouter auth header contains `Bearere` typo.
- `src/codin/agent/llm_gateway.py`: OpenAI gateway uses `eval` on tool arguments.
- `src/codin/agent/llm_gateway.py`: OpenRouter formatting uses `tc.get("name", "")` as call ID.

- `src/codin/cli/cli.py`: orchestrator initialization passes `working_directory=working_directory` instead of resolved `wd`.
- `main.py`: docstring says CLI launch but code launches TUI entrypoint.

## Migration Decision Rule

For each item above, decide one of:

1. Preserve in parity phase, fix after cutover.
2. Fix in Python first, regenerate parity baseline, then port fixed behavior.

Record decision per item before TypeScript implementation starts.


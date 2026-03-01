# Runtime, Prompts, And Config

## Config Loader

Source: `src/codin/runtime/config_loader.py`

Priority:

1. JSON config file (`configs/default_setting.json` by default).
2. Env overrides:
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `OPENROUTER_API_KEY`
   - `CODIN_LLM_MODEL`
   - `CODIN_WORKING_DIR`

Provider mapping:

- `anthropic`, `openai`, `openrouter`

## Prompt Loader

Source: `src/codin/runtime/prompt_loader.py`

Composition:

1. Base system prompt from `prompts/system_prompt.txt`.
2. Platform-specific guidance (Windows/macOS/Linux).
3. Project instructions from `AGENTS.md` (or fallback `configs/project.AGENT.md`).

## Tool Schema Loader

Source: `src/codin/runtime/tool_schema_loader.py`

- Loads `specs/tool_schemas/tools.json`.
- Formats into LLM function-call structure:
  - `name`
  - `description`
  - `parameters`

## Migration Notes

- Keep prompt assembly order unchanged to avoid behavior drift.
- Keep tool description map behavior from loader (including default fallback text).
- Keep environment override precedence unchanged.

## Security Note

- `configs/default_setting.json` currently contains an API key-like value.
- Rotate/remove secret values before any public branch or external migration sharing.


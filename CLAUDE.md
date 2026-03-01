# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Codin is a terminal-based AI coding assistant with TUI and CLI interfaces. The codebase has been fully migrated from Python to TypeScript. The TUI is implemented in TypeScript using `@opentui/core`, and the agent core and tools are also now in TypeScript.

## Commands

### Running the TUI
```bash
bun run dev
# or explicitly
bun run index.core.ts
```

### Running Tests
```bash
bun test
```

## Architecture

### Entry Point

**Main Entry**: `index.core.ts` creates a CLI renderer, shows a loading screen, initializes the agent in the background, and then renders the main app from `tui/app.ts`.

### TUI Layer (TypeScript)

**State Management**: `tui/app.ts` manages:
- Screen state (`prompt` | `chat`)
- User inputs (prompt text, chat input, messages)
- Mode/model selection (Chat/Code/Search, gpt-4o/gpt-4.1/gpt-4o-mini)
- Keyboard shortcuts per screen
- Component composition
- Agent lifecycle (initialization, shutdown)

**Key Files**:
- `tui/app.ts` - Main app state and initialization
- `tui/state.ts` - Global state management
- `tui/prompt-screen.ts` - Prompt/composer screen
- `tui/chat-screen.ts` - Chat interface screen
- `tui/agent-binding.ts` - Agent-to-TUI integration
- `tui/keyboard.ts` - Keyboard shortcut handling
- `tui/themes.ts` - Color themes

**Components** (`tui/components/`):
- Background decorators, prompts, chat widgets
- Selection overlays for mode/model selection
- Sidebar with todos and files
- Status bar and footer

**Configuration** (`tui/config/options.ts`):
- `modeOptions`: Chat, Code, Search modes
- `modelOptions`: gpt-4o, gpt-4.1, gpt-4o-mini, etc.
- Tab options for selectors

**Keybindings**:
- Prompt screen: `Tab` (switch tabs), `Enter` (open overlay/pick), `Esc` (close overlay/focus input)
- Chat screen: `Ctrl+B` (toggle sidebar), `Ctrl+C` (exit), `Esc` (close sidebar)

### Agent Layer (TypeScript)

**Core Components** (`src/agent/`):
- `orchestrator.ts`: `AgentOrchestrator` class - main agent loop
- `llm-gateway.ts`: LLM provider interfaces (Anthropic, OpenAI, OpenRouter)
- `permission-engine.ts`: Permission checks with allow/deny/prompt decisions
- `tool-executor.ts`: Tool registry and execution
- `subagent.ts`: SubAgentManager for handling `task` tool calls
- `todo-manager.ts`: Todo state management
- `context-manager.ts`: File caching and context window management
- `change-preview.ts`: Diff previews
- `error-recovery.ts`: Retry strategies
- `circuit-breaker.ts`: Circuit breaker for repeated failures
- `tool-validator.ts`: Tool argument validation

**Types** (`src/types/`):
- `agent.ts`: Message, Todo, ToolExecution, PermissionRule, SessionState
- `llm.ts`: LLMProvider, LLMConfig, LLMResponse
- `permissions.ts`: PermissionDecision, RiskLevel, PermissionRequest
- `subagent.ts`: SubAgentTaskType, SubAgentResult
- `tools.ts`: Tool schemas and parameter types

### Tools Layer (TypeScript)

**Tool Registry** (`src/tools/index.ts`): All 28 tools exported and registered

**File Operations**:
- `read_file.ts` - Read file contents
- `write_file.ts` - Write/create files
- `list_files.ts` - List directory contents
- `edit_file.ts` - Edit file with patches
- `multi_edit.ts` - Multiple edits in one operation
- `file-management.ts` - Copy, move, delete, create directory, compress, extract

**Search**:
- `grep.ts` - Search file contents
- `search-and-replace.ts` - Find and replace text

**Git**:
- `git-tools.ts` - `git_status`, `git_diff`

**System**:
- `bash-runner.ts` - Execute shell commands

**Agent**:
- `agent-tools.ts` - `todo_write`, `task`

**Rebuild Pipeline**:
- `rebuild-tools.ts` - Site capture, design token extraction, component mapping, asset harvesting, code generation, visual diff, auto-fix, finalization

**Web** (FREE - no API costs):
- `web-search.ts` - Web search
- `web-fetch.ts` - Fetch web content
- `fetch.ts` - Generic URL fetcher

### Memory Layer (TypeScript)

**Components** (`src/memory/`):
- `db.ts` - SQLite database (better-sqlite3)
- `conversation-memory.ts` - Message history storage
- `semantic-memory.ts` - Vector embeddings for semantic search
- `retrieval-engine.ts` - Memory retrieval algorithms
- `working-context.ts` - Active context tracking
- `project-index.ts` - Project structure indexing

### Runtime Layer (TypeScript)

**Components** (`src/runtime/`):
- `bootstrap.ts` - Application initialization
- `config.ts` - Configuration loader with env override precedence
- `prompt.ts` - System prompt assembly from base + platform + project
- `session-persistence.ts` - Session save/load to `~/.codin/sessions/`
- `tool-schema.ts` - Tool schema loader from `specs/tool_schemas/tools.json`
- `config-validation.ts` - Config validation with Zod
- `lifecycle.ts` - App lifecycle hooks
- `models.ts` - Runtime data models

### CLI Layer (TypeScript)

**Components** (`src/cli/`):
- `cli.ts` - CLI interface and command handlers

### Utils Layer (TypeScript)

**Components** (`src/utils/`):
- `fs.ts` - File system helpers (path resolution, safety checks)
- `file-tracker.ts` - File change tracking

## Agent Flow

**Orchestrator Loop** (`src/agent/orchestrator.ts`):
1. User input appended as `Message(role=user)`
2. Loop up to `max_iterations` (default 50)
3. LLM called with current messages + active tools + system prompt
4. Assistant message appended
5. If tool calls present:
   - Permission check per tool call (via `PermissionEngine`)
   - Inject state for `todo_write` tool calls
   - Inject `subagent_manager` for `task` tool calls
   - Execute tool via `ToolExecutor` (with retry manager)
   - Append tool result message
   - Continue loop
6. Stop when finish reason is `stop` or `end_turn`
7. On max iterations, append system warning message

**State Types** (`src/types/agent.ts`):
- `MessageRole`: `user | assistant | system | tool`
- `Message`: `role`, `content`, optional `tool_calls`, `tool_call_id`, `name`
- `Todo`: `id`, `content`, `status`, optional `assignee`
- `ToolExecution`: `tool_name`, `arguments`, `result`, `timestamp`, `success`, optional `error`
- `PermissionRule`: `id`, `tool`, `path_glob`, `allow`, `description`, `persistent`
- `SessionState`: messages, todos, working_directory, permission_rules, tool_execution_log, ui_state, token_usage, performance_metrics, dry_run_mode, mode

**Modes**:
- Default mode excludes rebuild tool set
- Rebuild mode includes all tools and appends rebuild prompt suffix
- APIs: `setMode("default" | "rebuild")`, `getMode()`

**Callback Surfaces** (via `AgentOrchestrator`):
- `onMessage` - Message appended callback
- `onToolCall` - Tool about to be called
- `onToolResult` - Tool completed
- `onApproval` - Permission approval request

## Tool Contracts

**All 28 registered tools**:
- Core: `read_file`, `write_file`, `list_files`, `grep`, `bash`, `edit_file`, `multi_edit`, `search_and_replace`
- Git: `git_status`, `git_diff`
- Agent: `todo_write`, `task`
- File: `copy_file`, `move_file`, `delete_file`, `create_directory`, `compress`, `extract`
- Rebuild: `rebuild_init`, `capture_site`, `extract_design_tokens`, `extract_component_map`, `harvest_assets`, `generate_code`, `visual_diff`, `auto_fix_pass`, `rebuild_finalize`
- Web: `web_search`, `web_fetch`, `fetch`

**Function signatures** (implementation args):
- `readFile(path, workingDirectory?)`
- `writeFile(path, contents, createIfMissing?, workingDirectory?)`
- `listFiles(path?, recursive?, includeHidden?, workingDirectory?)`
- `grep(pattern, path?, recursive?, caseSensitive?, workingDirectory?)`
- `bashRunner(command, timeoutSeconds?, workingDirectory?)`
- `editFile(path, patch, workingDirectory?)`
- `multiEdit(edits, commitMessage?, workingDirectory?)`
- `searchAndReplace(path, search, replace, regex?, caseSensitive?, workingDirectory?)`
- `gitStatus(workingDirectory?)`
- `gitDiff(path?, workingDirectory?)`
- `todoWrite(operation, todos?, todoId?, content?, status?, assignee?, state?)`
- `task(task, context?, taskType?, subagentManager?)`
- Plus file ops, compress/extract, and rebuild tools

## Permissions and Safety

**Permission Engine** (`src/agent/permission-engine.ts`):

**Decisions**: `allow | deny | prompt`

**Risk Levels**: `low | medium | high | critical`

**Decision Flow**:
1. Identify affected files from tool arguments
2. Classify risk
3. Apply explicit `SessionState.permission_rules` first
4. Auto-allow read-only tools: `read_file`, `list_files`, `grep`, `git_status`, `git_diff`, `web_search`, `web_fetch`, `fetch`
5. Medium/high/critical require approval callback; if absent, return `prompt`

**Safety-Relevant Behaviors**:
- Path-glob matching with minimatch
- `bash` heuristic detection for dangerous commands (`rm -rf`, `sudo`, etc.)
- Sensitive path patterns influence risk level (`.env`, workflow files, lock/manifests)

**PermissionRequest** callback shape:
- `toolName`, `arguments`, `affectedFiles`, `riskLevel`, optional `diffPreview`

## Runtime, Prompts, and Config

**Config Loader** (`src/runtime/config.ts`):

**Priority**:
1. JSON config file (`configs/default_setting.json` by default)
2. Env overrides:
   - `ANTHROPIC_API_KEY`
   - `OPENAI_API_KEY`
   - `OPENROUTER_API_KEY`
   - `CODIN_LLM_MODEL`
   - `CODIN_WORKING_DIR`

**Providers**: `anthropic`, `openai`, `openrouter`

**Prompt Loader** (`src/runtime/prompt.ts`):

**Composition**:
1. Base system prompt from `prompts/system_prompt.txt`
2. Platform-specific guidance (Windows/macOS/Linux)
3. Project instructions from `AGENT.md` (or fallback `configs/project.AGENT.md`)

**Tool Schema Loader** (`src/runtime/tool-schema.ts`):
- Loads `specs/tool_schemas/tools.json`
- Formats into LLM function-call structure: `name`, `description`, `parameters`

## Session Persistence

**Storage Model** (`src/runtime/session-persistence.ts`):
- Default storage dir: `~/.codin/sessions`
- Session file: `<session_id>.json`
- Index file: `sessions_index.json`

**Stored Data** (session file):
- `sessionId`, `name`, `description`, `createdAt`, `updatedAt`
- `state`: messages, todos, workingDirectory, permissionRules, toolExecutionLog, uiState, tokenUsage, performanceMetrics, dryRunMode, mode

**Public APIs**:
- `saveSession`
- `loadSession`
- `listSessions`
- `deleteSession`
- `getSessionMetadata`
- `exportSession(format= "json" | "markdown")`
- `importSession`
- `cleanupOldSessions`

## LLM Provider Mapping

**LLM Gateway** (`src/agent/llm-gateway.ts`):

**Providers**:
- `AnthropicGateway`
- `OpenAIGateway`
- `OpenRouterGateway`

**Shared Contract**:
- Input: `messages`, `tools`, `systemPrompt`
- Output: `LLMResponse` with `content`, optional `toolCalls[]` (`id`, `name`, `arguments`), `finishReason`

**Message Conversion**:
- Internal message model converted per provider
- Tool messages represented as provider-specific tool result messages
- Assistant messages with tool calls include serialized function arguments

## Memory System

**Components** (`src/memory/`):
- **SQLite database** (`db.ts`) - persistent storage using better-sqlite3
- **Conversation Memory** - stores message history with metadata
- **Semantic Memory** - vector embeddings for semantic search (uses embeddings API)
- **Retrieval Engine** - RAG-style retrieval based on context relevance
- **Working Context** - tracks currently relevant files and conversations
- **Project Index** - indexes project structure for faster lookups

## Dependencies

**TUI**:
- `@opentui/core`: Core TUI rendering primitives
- React integration via `@opentui/react` where applicable

**Core**:
- `openai`: OpenAI SDK
- `zod`: Runtime validation
- `better-sqlite3`: SQLite database for persistence and memory

**Development**:
- `playwright`: Browser automation (for rebuild pipeline visual diff)
- `sharp`: Image processing
- `pixelmatch`: Image comparison

**Tooling**:
- `typescript`: TypeScript compiler
- `bun`: Runtime and package manager

## Specs Directory (Authoritative Sources)

- `specs/tool_schemas/tools.json`: Tool schema definitions (authoritative source of truth)
- `specs/permission_rules/permission_rules.json`: Default permission rules
- `specs/permission_rules/decision_table.md`: Permission decision documentation
- `prompts/`: System prompt, subagent prompt, assistant template
- `configs/`: Default settings, project AGENT.md

## File Structure

```
codin-core/
├── index.core.ts          # Main entry point
├── tui/                   # TUI layer (screens, components, state)
├── src/
│   ├── agent/             # Agent core (orchestrator, permissions, LLM gateway)
│   ├── tools/             # All tool implementations
│   ├── runtime/           # Config, prompts, persistence, tool schema
│   ├── cli/               # CLI interface
│   ├── memory/            # SQLite-based memory system
│   ├── utils/             # File system helpers
│   └── types/             # TypeScript type definitions
├── specs/                 # Authoritative specs
├── prompts/               # Prompt templates
├── configs/               # Configuration files
└── tests/                 # Tests
```

## Development Notes

- **TypeScript**: Full type safety with Zod validation at runtime
- **ESM**: Uses ES modules (`"type": "module"` in package.json)
- **Bun**: Fast runtime and package manager
- **Hot reload**: Run `bun run dev` for development
- **Database**: SQLite persists sessions, memory, and project index

## Production Readiness

See `PRODUCTION_READINESS.md` for details on:
- Error handling and recovery
- Permission system
- Session persistence
- Tool execution reliability
- Memory system durability

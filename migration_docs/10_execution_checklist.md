# Execution Checklist

## Phase 0: Baseline Capture

- [ ] Freeze Python branch for migration baseline.
- [ ] Capture CLI interaction transcripts for representative tasks.
- [ ] Capture tool-level outputs for all tools.
- [ ] Capture permission engine decisions for fixture cases.
- [ ] Capture session save/load/export samples.

## Phase 1: TypeScript Scaffolding

- [ ] Create TS workspace and strict compiler settings.
- [ ] Add runtime validation library (`zod` or `ajv`).
- [ ] Add test runner and parity test command.

## Phase 2: Runtime Layer

- [ ] Port `ConfigLoader`.
- [ ] Port `PromptLoader`.
- [ ] Port `ToolSchemaLoader`.
- [ ] Validate provider/env override precedence.

## Phase 3: Tool Layer

- [ ] Port all non-rebuild tools.
- [ ] Port rebuild toolchain.
- [ ] Implement schema-to-impl arg adapters where needed.
- [ ] Match Python return object shapes.

## Phase 4: Agent Layer

- [ ] Port state models.
- [ ] Port permission engine.
- [ ] Port tool executor and registry.
- [ ] Port orchestrator loop, callbacks, and mode logic.
- [ ] Port sub-agent manager and task flow.

## Phase 5: Interfaces

- [ ] Port CLI command handling (`/session`, `/mode`, `/help`, exit autosave).
- [ ] Port TUI equivalents or provide compatibility adapter if UI stack differs.

## Phase 6: Persistence

- [ ] Port session persistence APIs.
- [ ] Validate read compatibility with existing Python session files.
- [ ] Validate export json/markdown parity.

## Phase 7: Verification And Cutover

- [ ] Run parity suite and resolve mismatches.
- [ ] Perform soak run in TS primary mode.
- [ ] Enable controlled fallback to Python for unresolved edge cases.
- [ ] Cut over after all release blockers are closed.


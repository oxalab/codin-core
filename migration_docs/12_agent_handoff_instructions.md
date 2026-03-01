# Agent Handoff Instructions

Follow this exact order when implementing TypeScript migration.

## Step Order

1. Read `migration_docs/README.md`.
2. Read `migration_docs/04_tool_contracts.md` and `migration_docs/11_known_gaps_and_bug_compatibility.md`.
3. Build TS project skeleton.
4. Port runtime loaders.
5. Port tool implementations and adapters.
6. Port state, permissions, executor, orchestrator.
7. Port CLI commands.
8. Port or adapt TUI.
9. Build parity suite per `migration_docs/09_parity_test_plan.md`.
10. Run full checklist in `migration_docs/10_execution_checklist.md`.

## Non-Negotiable Acceptance

- No missing tools from `specs/tool_schemas/tools.json`.
- No undocumented mismatch between Python and TS behavior.
- Every known mismatch must have a tracked decision (preserve/fix).
- Session compatibility tested with real saved session samples.

## Delivery Artifacts Required

- TS implementation branch.
- Parity report with pass/fail table.
- Gap list reduced to explicit accepted waivers only.
- Cutover recommendation with risk summary.


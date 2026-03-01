# Parity Test Plan

## Goal

Detect behavior differences between Python and TS before cutover.

## Harness Design

Create fixtures for each category:

1. Tool contract fixtures
2. Permission decision fixtures
3. Agent loop fixtures (simulated LLM outputs)
4. Session serialization fixtures
5. Rebuild pipeline smoke fixtures

## Fixture Format

Use JSON files under `tests/parity/fixtures/`:

- `input`: tool/method call input
- `expected_python`: captured current output
- `notes`: caveats

## Comparison Rules

- Compare structural equality for JSON outputs.
- Normalize non-deterministic fields:
  - timestamps
  - UUIDs
  - generated run IDs
  - absolute paths (if platform variance exists)

## Minimal Required Parity Matrix

1. Each tool in `specs/tool_schemas/tools.json`
2. Permission engine outcomes for low/medium/high risk
3. `AgentOrchestrator._agent_loop` tool-call cycle
4. Session save/load roundtrip
5. Rebuild flow from `rebuild_init` to `rebuild_finalize` (mock network where needed)

## CI Gate

- Fail build when any fixture mismatch is unapproved.
- Maintain waiver file for known intentional differences with expiry date.


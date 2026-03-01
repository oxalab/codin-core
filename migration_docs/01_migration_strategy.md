# Migration Strategy

## Objective

Port Python implementation in `src/codin/` to TypeScript without losing tools, flows, or safety behavior.

## Rules

- Do not "improve" behavior until parity baseline is green.
- Preserve current output shapes, even where current behavior is flawed.
- Separate work into two tracks:
  - Track A: parity port.
  - Track B: post-parity fixes.

## Suggested Target Layout

```text
ts/
  src/
    agent/
    tools/
    runtime/
    cli/
    tui/
    utils/
  tests/
    parity/
```

## Migration Phases

1. Baseline capture
2. Runtime and schema loaders
3. Tool layer
4. Agent state + orchestrator loop
5. CLI commands + session commands + mode commands
6. TUI integration
7. Dual-run and cutover

## Cutover Gates

- All tool contracts implemented.
- Parity tests pass for critical fixtures.
- No unresolved high-severity mismatches.
- Session import/export compatibility validated.


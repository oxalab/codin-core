# TypeScript Migration Reference

This folder is the source of truth for migrating `codin-core` from Python to TypeScript with behavior parity.

## Document Map

1. `migration_docs/01_migration_strategy.md`
2. `migration_docs/02_repo_inventory.md`
3. `migration_docs/03_agent_flow_and_state.md`
4. `migration_docs/04_tool_contracts.md`
5. `migration_docs/05_permissions_and_safety.md`
6. `migration_docs/06_runtime_prompts_and_config.md`
7. `migration_docs/07_session_persistence_contract.md`
8. `migration_docs/08_llm_provider_mapping.md`
9. `migration_docs/09_parity_test_plan.md`
10. `migration_docs/10_execution_checklist.md`
11. `migration_docs/11_known_gaps_and_bug_compatibility.md`
12. `migration_docs/12_agent_handoff_instructions.md`

## Generated Artifacts

- `migration_docs/generated/function_inventory.json`: AST-derived class/function inventory.
- `migration_docs/generated/tool_schema_vs_impl_report.json`: schema vs implementation arg mismatch report.

## Required Migration Guarantees

- Every tool listed in `specs/tool_schemas/tools.json` exists in TS.
- Agent loop behavior is preserved: message flow, permission gate, tool execution loop.
- Session read/write compatibility is maintained or versioned with migration adapters.
- Explicit parity tests compare Python and TS on shared fixtures before cutover.

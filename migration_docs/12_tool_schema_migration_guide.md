# Tool Schema Migration Guide

This document tracks the changes made to `specs/tool_schemas/tools.json` and what needs to be updated in Python implementations to maintain parity.

## Summary of Changes

The tool schemas have been significantly enhanced to match the quality and concreteness of the Claude SDK tool definitions:

1. **Tool-level descriptions** - Every tool now has a clear description of what it does
2. **Parameter descriptions** - All parameters have detailed descriptions
3. **Validation constraints** - Added `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `pattern`, `format`
4. **Default values** - Explicit `default` properties where applicable
5. **Concrete examples** - Examples in descriptions for key tools (bash, edit_file, grep)
6. **Parameter naming** - Standardized naming conventions

---

## Implementation Changes Required

### 1. Parameter Renames

The following parameters were renamed for consistency:

| Old Parameter | New Parameter | Affected Tools |
|--------------|---------------|----------------|
| `run_id` | `session_id` | All rebuild tools |
| `contents` | `contents` (unchanged) | write_file - was already correct |
| `content` (todo) | `content` (unchanged) | todo_write |
| `case_sensitive` (grep) | `case_insensitive` | grep - inverted logic! |
| `working_directory` (git_status) | `working_directory` | git_status - was already correct |

**Note:** The Python `grep` implementation uses `case_sensitive=True` as default. The new schema uses `case_insensitive=false` as default (same behavior). However, the parameter is now called `case_insensitive` - you'll need to either:
- Accept `case_insensitive` and invert the value
- Update the schema to use `case_sensitive` with inverted default

### 2. New Parameters

The following parameters were added to tools. Implementations should accept these:

#### `git_diff`
- **New:** `cached` - Alias for `staged`
- **New:** `commit` - Compare against a specific commit

#### `rebuild_init`
- **New:** `session_id` - Optional explicit session identifier (previously auto-only)

#### `capture_site`
- **New:** `capture_screenshots` - Control screenshot capture

#### `search_and_replace`
- **New:** `case_sensitive` - Explicit case sensitivity control

#### `bash`
- **New:** `description` - Human-readable description for logging/permissions

#### `multi_edit`
- **New:** `edits[].path` - Each edit item now has explicit structure

### 3. Validation Constraints

Implementations should validate these constraints:

#### `read_file`
- `offset`: minimum 1
- `limit`: minimum 1, maximum 10000

#### `bash`
- `timeout_seconds`: minimum 1, maximum 600
- `description`: maxLength 200

#### `multi_edit`
- `edits`: minItems 1, maxItems 50
- `commit_message`: maxLength 2000

#### `compress`
- `sources`: minItems 1, maxItems 1000

#### `rebuild_init`
- `url`: must match pattern `^https?://`
- `breakpoints`: items minimum 320, maximum 3840
- `session_id`: pattern `^[a-zA-Z0-9_-]+$`

#### `capture_site`
- `timeout_seconds`: minimum 5, maximum 120

#### `harvest_assets`
- `timeout_seconds`: minimum 10, maximum 300

#### `visual_diff`
- `threshold`: minimum 0, maximum 255

#### `auto_fix_pass`
- `max_fixes`: minimum 1, maximum 100
- `target_similarity`: minimum 0, maximum 1

### 4. Enum Values

The following enums were added or modified - ensure validation accepts these values:

#### `todo_write`
- `operation`: Added `bulk_create` (was missing)
- `todo.status`: Now accepts `"completed"` (was `"done"`)

#### `task` (formerly `task`)
- `subagent_type`: Now includes `"explore"`, `"plan"`, `"bash"`, `"claude-code-guide"`, `"agents-design-experience:accessibility-specialist"`, `"agents-design-experience:ui-ux-designer"`

#### `generate_code`
- `framework`: `"react" | "vue" | "svelte" | "solid" | "html"`
- `styling`: `"tailwind" | "css-modules" | "styled-components" | "vanilla-css"`
- `accessibility`: `"none" | "basic" | "wcag-aa" | "wcag-aaa"`

#### `rebuild_finalize`
- `output_format`: `"source" | "bundled" | "docker"`

---

## Known Schema vs Implementation Gaps

These gaps existed before and still need to be resolved:

### `edit_file`
- **Schema expects:** `old_string`, `new_string`, `replace_all`
- **Implementation expects:** `patch`
- **Decision:** Schema changed to match SDK convention. Implementation needs adapter or update.

### `grep`
- **Schema now includes:** `case_insensitive`, `include_hidden`, `max_results`
- **Implementation:** Only supports `case_sensitive`, ignores others
- **Fix:** Add `case_insensitive` parameter (invert current logic), implement others

### `git_diff`
- **Schema includes:** `staged`
- **Implementation:** Ignores `staged`
- **Fix:** Implement `staged` parameter support

---

## Default Values

The following default values were established. Ensure implementations respect these:

| Tool | Parameter | Default |
|------|-----------|---------|
| list_files | recursive | false |
| list_files | include_hidden | false |
| grep | recursive | true |
| grep | case_insensitive | false |
| grep | max_results | 100 |
| edit_file | replace_all | false |
| search_and_replace | use_regex | true |
| search_and_replace | case_sensitive | true |
| bash | timeout_seconds | 120 |
| write_file | create_if_missing | true |
| copy_file | recursive | true |
| copy_file | overwrite | false |
| move_file | overwrite | false |
| delete_file | recursive | true |
| delete_file | force | false |
| create_directory | parents | true |
| create_directory | exist_ok | true |
| compress | format | "zip" |
| extract | overwrite | false |
| rebuild_init | target_stack | "nextjs-tailwind" |
| rebuild_init | breakpoints | [640, 768, 1024, 1280] |
| rebuild_init | states | ["default", "hover", "active", "focus", "disabled"] |
| capture_site | fetch_css | true |
| capture_site | fetch_js | true |
| capture_site | capture_screenshots | true |
| capture_site | timeout_seconds | 30 |
| extract_design_tokens | output_format | "json" |
| extract_component_map | min_confidence | 0.7 |
| harvest_assets | include_images | true |
| harvest_assets | include_fonts | true |
| harvest_assets | include_css | true |
| harvest_assets | include_js | false |
| harvest_assets | optimize_images | true |
| harvest_assets | timeout_seconds | 60 |
| generate_code | styling | "tailwind" |
| generate_code | include_tokens_css | true |
| generate_code | accessibility | "wcag-aa" |
| visual_diff | threshold | 10 |
| auto_fix_pass | max_fixes | 10 |
| auto_fix_pass | target_similarity | 0.95 |
| rebuild_finalize | output_format | "source" |
| rebuild_finalize | include_docs | true |

---

## Migration Checklist

For each tool implementation, verify:

- [ ] Schema parameters match implementation function signature
- [ ] Default values are correctly applied
- [ ] Enum values are validated
- [ ] Validation constraints are enforced
- [ ] New parameters are accepted and handled
- [ ] Renamed parameters are mapped correctly (run_id → session_id)
- [ ] Tool behavior matches the schema description
- [ ] Error messages reference the schema parameter names

---

## TypeScript Definitions

A new file `reference/codin-tools.d.ts` has been generated with TypeScript definitions matching the updated schema. Use this for type checking when porting to TypeScript.

Key conventions established:
- `path` for file/directory paths
- `source`/`destination` for copy/move operations
- `contents` for file content (write_file)
- `session_id` for rebuild session state
- `timeout_seconds` for timeouts in seconds

---

## Next Steps

1. Update Python tool implementations to match schema
2. Add parameter validation in tool executor
3. Update tool schema loader to handle new defaults
4. Run parity tests to verify behavior
5. Update this document as new gaps are found

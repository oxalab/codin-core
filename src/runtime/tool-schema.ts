/**
 * Tool Schema Loader
 * Ported from src/codin/runtime/tool_schema_loader.py
 */

import { readFile } from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { ToolDefinition, ToolSchema } from "../types/tools.js";

// Tool descriptions (from architecture docs)
const TOOL_DESCRIPTIONS: Record<string, string> = {
  read_file: "Read contents of a file. Returns file content as a string.",
  write_file: "Write contents to a file. Creates file if it doesn't exist (if create_if_missing is True).",
  list_files: "List files and directories in a path. Can list recursively.",
  grep: "Search for a pattern in files using regex. Can search recursively in directories.",
  bash: "Execute a bash command. Use with caution - dangerous commands require approval.",
  edit_file: "Edit a file by applying a unified diff patch.",
  multi_edit: "Apply multiple edits to multiple files at once. Useful for refactoring.",
  search_and_replace: "Search and replace text in a file. Supports regex patterns.",
  git_status: "Get git status of repository. Shows modified, added, and deleted files.",
  git_diff: "Get git diff. Shows changes in tracked files.",
  todo_write: "Manage TODO items. Create, update, list, or delete TODOs. Use this for multi-step planning and progress tracking. Operations: 'create' (single), 'bulk_create' (multiple), 'update' (change status/content), 'list' (view all), 'delete' (remove).",
  task: "Execute a task using an ephemeral sub-agent. Sub-agents have no tool access and are one-shot. Useful for: summarizing code/repos, brainstorming solutions, planning approaches, analyzing code patterns, generating test ideas. Provide context in 'context' parameter for better results.",
  rebuild_init: "Initialize a website rebuild run with URL, breakpoints, states, and output directories. Requires permission_confirmed=true.",
  capture_site: "Capture source HTML, linked stylesheets, and discovered assets for a rebuild run.",
  extract_design_tokens: "Extract design tokens (colors, fonts, spacing, radius, shadows, motion) from captured artifacts.",
  extract_component_map: "Build a section/component map from captured DOM structure and semantic class hints.",
  harvest_assets: "Download discovered assets (images/fonts/css/js) into a local run folder and generate asset manifest mappings.",
  generate_code: "Generate rebuild output code from captured artifacts and manifests (static-html or nextjs-tailwind).",
  visual_diff: "Compare captured source and generated output, producing a diff report with similarity metrics.",
  auto_fix_pass: "Apply deterministic fix passes based on diff report results to improve generated output.",
  rebuild_finalize: "Aggregate run artifacts and emit a final rebuild report with unresolved gaps.",
};

// Empty tool schema for fallback
const EMPTY_TOOL_SCHEMA: ToolSchema = {
  type: "object",
  properties: {},
  required: [],
  additionalProperties: false,
};

/**
 * Extended tool schema interface for internal use
 */
interface ExtendedToolSchemaProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: unknown;
  properties?: Record<string, unknown>;
  required?: string[];
}

interface ExtendedToolSchema {
  type: "object";
  properties?: Record<string, ExtendedToolSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * ToolSchemaLoader class
 * Ported from Python ToolSchemaLoader
 */
export class ToolSchemaLoader {
  private schemaPath: string;

  constructor(schemaPath?: string) {
    // Default to specs/tool_schemas/tools.json
    // Use fileURLToPath for proper Windows path handling
    // From src/runtime/tool-schema.ts, go up two levels to reach project root
    const moduleDir = import.meta.url ? dirname(fileURLToPath(import.meta.url)) : "";
    this.schemaPath = schemaPath || resolve(moduleDir, "..", "..", "specs", "tool_schemas", "tools.json");
  }

  /**
   * Load tool schemas from JSON file
   */
  async loadSchemas(): Promise<ExtendedToolSchema> {
    try {
      const content = await readFile(this.schemaPath, "utf-8");
      return JSON.parse(content) as ExtendedToolSchema;
    } catch (e) {
      if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
        return EMPTY_TOOL_SCHEMA;
      }
      throw new Error(`Invalid JSON in schema file: ${(e as Error).message}`);
    }
  }

  /**
   * Format tool schemas for LLM consumption
   * Returns list of tool definitions in LLM format.
   */
  async formatForLLM(minimal = false): Promise<ToolDefinition[]> {
    const schemas = await this.loadSchemas();
    const tools: ToolDefinition[] = [];

    // Minimal tool set for low-credit scenarios (saves ~40% tokens)
    const MINIMAL_TOOLS = new Set([
      "read_file",
      "write_file",
      "bash",
    ]);

    for (const [toolName, schema] of Object.entries(schemas.properties || {})) {
      // Skip non-minimal tools if minimal mode is enabled
      if (minimal && !MINIMAL_TOOLS.has(toolName)) {
        continue;
      }

      const description = TOOL_DESCRIPTIONS[toolName] || `Execute ${toolName}`;

      // Extract properties and required from schema
      const schemaProps = (schema as ExtendedToolSchemaProperty).properties as Record<string, unknown> | undefined;
      const schemaRequired = (schema as ExtendedToolSchemaProperty).required as string[] | undefined;

      // Convert JSON schema to LLM tool format
      const toolDef: ToolDefinition = {
        name: toolName,
        description,
        parameters: {
          type: "object",
          properties: (schemaProps || {}) as Record<string, {
            type: string;
            description?: string;
            enum?: string[];
          }>,
          required: schemaRequired || [],
        },
      };

      tools.push(toolDef);
    }

    return tools;
  }

  /**
   * Get list of available tool names
   */
  async getToolNames(): Promise<string[]> {
    const schemas = await this.loadSchemas();
    return Object.keys(schemas.properties || {});
  }
}

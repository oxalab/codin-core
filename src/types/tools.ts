/**
 * Tool Types
 * Tool schema and implementation types
 */

/**
 * Tool schema interface - matches JSON schema format from specs/tool_schemas/tools.json
 */
export interface ToolSchema {
  type: "object";
  properties: Record<string, {
    type: string;
    description?: string;
    enum?: string[];
    items?: unknown;
  }>;
  required: string[];
  additionalProperties?: boolean;
}

/**
 * Tool definition interface - LLM-compatible tool definition
 */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
}

/**
 * Tool result interface - standard result format from tool execution
 */
export interface ToolResult {
  success: boolean;
  [key: string]: unknown;
}

/**
 * Tool implementation function type
 */
export type ToolImplementation<TArgs = Record<string, unknown>, TResult = unknown> = (
  args: TArgs
) => TResult | Promise<TResult>;

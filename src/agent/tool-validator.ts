/**
 * Tool Schema Validator
 * Validates tool arguments against JSON schemas
 */

import toolSchemas from "../../specs/tool_schemas/tools.json" with { type: "json" };
import type { ToolExecution } from "../types/agent.js";

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  value: unknown;
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Tool Schema Validator class
 */
export class ToolSchemaValidator {
  private schemas: Record<string, unknown>;

  constructor() {
    this.schemas = toolSchemas.properties as Record<string, unknown>;
  }

  /**
   * Validate tool arguments against schema
   */
  validate(toolName: string, args: Record<string, unknown>): ValidationResult {
    const schema = this.schemas[toolName];
    if (!schema) {
      return {
        valid: false,
        errors: [{ field: "_schema", message: `No schema found for tool: ${toolName}`, value: toolName }],
        warnings: [],
      };
    }

    const errors: ValidationError[] = [];
    const warnings: string[] = [];
    const toolSchema = schema as ToolSchema;

    // Check required fields
    if (toolSchema.required) {
      for (const required of toolSchema.required) {
        if (!(required in args) || args[required] === undefined || args[required] === null) {
          errors.push({
            field: required,
            message: `Missing required parameter: ${required}`,
            value: undefined,
          });
        }
      }
    }

    // Validate field types and constraints
    if (toolSchema.properties) {
      for (const [fieldName, fieldSchema] of Object.entries(toolSchema.properties)) {
        const value = args[fieldName];

        // Skip validation if field not provided and not required
        if (value === undefined) {
          continue;
        }

        const fieldDef = fieldSchema as PropertySchema;

        // Type validation
        if (fieldDef.type) {
          const typeError = this.validateType(fieldName, value, fieldDef.type, fieldDef);
          if (typeError) {
            errors.push(typeError);
          }
        }

        // Enum validation
        if (fieldDef.enum && Array.isArray(fieldDef.enum)) {
          if (!fieldDef.enum.includes(value as string)) {
            errors.push({
              field: fieldName,
              message: `Value must be one of: ${fieldDef.enum.join(", ")}`,
              value,
            });
          }
        }

        // Array item validation
        if (fieldDef.type === "array" && fieldDef.items && Array.isArray(value)) {
          const itemDef = fieldDef.items as PropertySchema;
          for (let i = 0; i < (value as unknown[]).length; i++) {
            const item = (value as unknown[])[i];
            if (itemDef.type) {
              const itemTypeError = this.validateType(`${fieldName}[${i}]`, item, itemDef.type, itemDef);
              if (itemTypeError) {
                errors.push(itemTypeError);
              }
            }
          }
        }
      }
    }

    // Check for unknown fields (LLM hallucinations)
    const knownFields = new Set(Object.keys(toolSchema.properties || {}));
    for (const argName of Object.keys(args)) {
      if (argName === "working_directory") {
        continue; // Auto-injected field
      }
      if (!knownFields.has(argName)) {
        warnings.push(`Unknown parameter: ${argName}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate a value against a type
   * Includes lenient type coercion for string values
   */
  private validateType(
    fieldName: string,
    value: unknown,
    expectedType: string | string[],
    fieldDef?: PropertySchema,
  ): ValidationError | null {
    const types = Array.isArray(expectedType) ? expectedType : [expectedType];
    const actualType = Array.isArray(value) ? "array" : typeof value;

    for (const type of types) {
      switch (type) {
        case "string":
          if (actualType === "string") return null;
          break;
        case "integer":
          if (actualType === "number" && Number.isInteger(value)) return null;
          // Lenient: allow string that can be parsed to integer
          if (actualType === "string" && /^\d+$/.test(value as string)) return null;
          break;
        case "number":
          if (actualType === "number") return null;
          // Lenient: allow string that can be parsed to number
          if (actualType === "string" && !isNaN(Number(value))) return null;
          break;
        case "boolean":
          if (actualType === "boolean") return null;
          // Lenient: allow common string boolean representations
          if (actualType === "string" && ["true", "false", "1", "0"].includes((value as string).toLowerCase())) return null;
          break;
        case "array":
          if (Array.isArray(value)) return null;
          break;
        case "object":
          if (actualType === "object" && value !== null && !Array.isArray(value)) return null;
          break;
      }
    }

    return {
      field: fieldName,
      message: `Expected type ${types.join(" or ")}, got ${actualType}`,
      value,
    };
  }

  /**
   * Format validation result as a string
   */
  formatValidationResult(result: ValidationResult): string {
    const parts: string[] = [];

    if (result.errors.length > 0) {
      parts.push("Errors:");
      for (const error of result.errors) {
        parts.push(`  - ${error.field}: ${error.message}`);
      }
    }

    if (result.warnings.length > 0) {
      parts.push("Warnings:");
      for (const warning of result.warnings) {
        parts.push(`  - ${warning}`);
      }
    }

    return parts.join("\n");
  }

  /**
   * Check if tool exists
   */
  hasTool(toolName: string): boolean {
    return toolName in this.schemas;
  }

  /**
   * Get all available tool names
   */
  getToolNames(): string[] {
    return Object.keys(this.schemas);
  }
}

/**
 * Schema types
 */
interface ToolSchema {
  type?: string;
  properties?: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
}

interface PropertySchema {
  type?: string | string[];
  enum?: string[];
  description?: string;
  items?: PropertySchema;
  properties?: Record<string, PropertySchema>;
  required?: string[];
}

/**
 * Global validator instance
 */
export const toolValidator = new ToolSchemaValidator();

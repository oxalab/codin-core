/**
 * Tool Executor
 * Enhanced with schema validation, circuit breakers, and better error handling
 */

import { TOOL_REGISTRY } from "../tools/index.js";
import { toolValidator, type ValidationResult } from "./tool-validator.js";
import { circuitBreakerRegistry, CircuitBreakerOpenError } from "./circuit-breaker.js";
import type { SessionState, ToolExecution } from "../types/agent.js";

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  skipValidation?: boolean;
  timeoutMs?: number;
  retryOnTimeout?: boolean;
}

/**
 * Enhanced Tool Executor class
 */
export class ToolExecutor {
  workingDirectory: string;
  private toolRegistry: Map<string, Function>;
  private executionLog: ToolExecution[] = [];
  private readonly maxLogSize: number = 100;

  constructor(workingDirectory: string = "") {
    this.workingDirectory = workingDirectory || process.cwd?.() || "";
    this.toolRegistry = new Map();
    this._loadTools();
  }

  /**
   * Dynamically load tools from the tool registry
   */
  private _loadTools(): void {
    for (const [name, fn] of Object.entries(TOOL_REGISTRY)) {
      this.toolRegistry.set(name, fn as Function);
    }
  }

  /**
   * Get list of available tool names
   */
  getToolNames(): string[] {
    return Array.from(this.toolRegistry.keys());
  }

  /**
   * Check if a tool exists
   */
  hasTool(toolName: string): boolean {
    return this.toolRegistry.has(toolName);
  }

  /**
   * Execute a tool with validation and circuit breaker protection
   */
  async execute(
    toolName: string,
    toolArgs: Record<string, unknown>,
    options: ToolExecutionOptions = {},
  ): Promise<ToolExecution> {
    const startTime = performance.now();
    const executionId = this.generateExecutionId();

    try {
      // 1. Check if tool exists
      if (!this.toolRegistry.has(toolName)) {
        throw this.createToolError(
          toolName,
          `Unknown tool: ${toolName}. Available tools: ${this.getToolNames().slice(0, 5).join(", ")}${this.getToolNames().length > 5 ? "..." : ""}`,
          "UNKNOWN_TOOL",
        );
      }

      // 2. Validate arguments
      if (!options.skipValidation) {
        const validationResult = toolValidator.validate(toolName, toolArgs);
        if (!validationResult.valid) {
          // Log full validation details to file for debugging
          try {
            await import("node:fs/promises").then(fs =>
              fs.appendFile("D:\\codin\\codin-core\\tool_validation_errors.json", JSON.stringify({
                tool: toolName,
                args: toolArgs,
                errors: validationResult.errors,
                warnings: validationResult.warnings,
                timestamp: new Date().toISOString(),
              }, null, 2) + "\n")
            );
          } catch {}
          throw this.createToolError(
            toolName,
            `Argument validation failed:\n${toolValidator.formatValidationResult(validationResult)}`,
            "VALIDATION_ERROR",
          );
        }
        if (validationResult.warnings.length > 0) {
          // Log warnings but continue
          console.warn(`[${toolName}] Warnings:`, validationResult.warnings.join(", "));
        }
      }

      // 3. Get tool function
      const toolFunc = this.toolRegistry.get(toolName)!;

      // 4. Prepare arguments (inject working_directory)
      const args = this.prepareArguments(toolArgs);

      // 5. Execute with circuit breaker protection
      const breaker = circuitBreakerRegistry.get(toolName);

      const result = await breaker.execute(async () => {
        return await this.executeWithTimeout(toolFunc, args, options.timeoutMs);
      });

      // 6. Format result
      const formattedResult = this.formatResult(result);

      const execution: ToolExecution = {
        tool_name: toolName,
        arguments: args,
        result: formattedResult,
        timestamp: startTime,
        success: true,
        execution_id: executionId,
        duration_ms: performance.now() - startTime,
      };

      this.logExecution(execution);
      return execution;
    } catch (error) {
      const execution: ToolExecution = {
        tool_name: toolName,
        arguments: toolArgs,
        result: null,
        timestamp: startTime,
        success: false,
        error: (error as Error).message,
        execution_id: executionId,
        duration_ms: performance.now() - startTime,
        error_type: this.getErrorType(error),
      };

      this.logExecution(execution);

      // Re-throw with additional context
      if (error instanceof CircuitBreakerOpenError) {
        // Don't re-throw circuit breaker errors - they're expected
        return execution;
      }

      return execution;
    }
  }

  /**
   * Prepare arguments by injecting defaults and coercing types
   */
  private prepareArguments(toolArgs: Record<string, unknown>): Record<string, unknown> {
    const args = { ...toolArgs };

    // Inject working_directory if not present
    if (!("working_directory" in args)) {
      args.working_directory = this.workingDirectory;
    }

    // Coerce types for lenient validation (some LLMs send strings for everything)
    for (const [key, value] of Object.entries(args)) {
      if (key === "working_directory") continue;

      if (typeof value === "string") {
        // Try to coerce to number
        if (/^\d+(\.\d+)?$/.test(value)) {
          args[key] = Number(value);
        }
        // Try to coerce to boolean
        else if (value.toLowerCase() === "true") {
          args[key] = true;
        } else if (value.toLowerCase() === "false") {
          args[key] = false;
        }
      }
    }

    return args;
  }

  /**
   * Execute a function with timeout
   */
  private async executeWithTimeout(
    fn: Function,
    args: Record<string, unknown>,
    timeoutMs: number = 30_000,
  ): Promise<unknown> {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Tool execution timeout after ${timeoutMs}ms`)), timeoutMs);
    });

    // Execute the tool (async or sync)
    const execPromise = (async () => {
      if (fn.constructor.name === "AsyncFunction") {
        return await fn(args);
      } else {
        return fn(args);
      }
    })();

    return Promise.race([execPromise, timeoutPromise]);
  }

  /**
   * Format tool result for LLM consumption
   */
  private formatResult(result: unknown): unknown {
    // If result already has standard format, return as-is
    if (
      typeof result === "object" &&
      result !== null &&
      !Array.isArray(result) &&
      ("success" in result || "error" in result || "result" in result)
    ) {
      return result;
    }

    // Primitive values
    if (result === null || result === undefined) {
      return { result: null };
    }

    if (typeof result === "string") {
      return { result };
    }

    if (typeof result === "number" || typeof result === "boolean") {
      return { result, type: typeof result };
    }

    // Arrays
    if (Array.isArray(result)) {
      return {
        result: result.slice(0, 1000), // Limit array size
        truncated: result.length > 1000,
        count: result.length,
        type: "array",
      };
    }

    // Objects - try to stringify
    try {
      const serialized = JSON.stringify(result, null, 2);
      if (serialized.length > 50_000) {
        return {
          result: serialized.slice(0, 50_000) + "...",
          truncated: true,
          type: "object",
        };
      }
      return { result, type: "object" };
    } catch {
      // Circular references or non-serializable
      return {
        result: String(result),
        type: typeof result,
        note: "Object could not be serialized",
      };
    }
  }

  /**
   * Format tool execution result as a string for the LLM
   */
  formatToolResult(execution: ToolExecution): string {
    if (!execution.success) {
      let msg = `Error executing ${execution.tool_name}`;
      if (execution.error_type) {
        msg += ` [${execution.error_type}]`;
      }
      if (execution.error) {
        msg += `: ${execution.error}`;
      }
      return msg;
    }

    try {
      return JSON.stringify(execution.result, null, 2);
    } catch {
      return String(execution.result);
    }
  }

  /**
   * Create a structured tool error
   */
  private createToolError(toolName: string, message: string, code: string): Error {
    const error = new Error(message) as ToolError;
    error.name = "ToolExecutionError";
    error.toolName = toolName;
    error.code = code;
    return error;
  }

  /**
   * Get error type from error
   */
  private getErrorType(error: unknown): string | undefined {
    if (error instanceof CircuitBreakerOpenError) {
      return "CIRCUIT_BREAKER_OPEN";
    }
    const toolError = error as ToolError;
    return toolError.code ?? "EXECUTION_ERROR";
  }

  /**
   * Log execution for debugging
   */
  private logExecution(execution: ToolExecution): void {
    this.executionLog.push(execution);
    if (this.executionLog.length > this.maxLogSize) {
      this.executionLog.shift();
    }
  }

  /**
   * Get execution log
   */
  getExecutionLog(): ToolExecution[] {
    return [...this.executionLog];
  }

  /**
   * Get recent executions for a tool
   */
  getRecentExecutions(toolName: string, count: number = 10): ToolExecution[] {
    return this.executionLog
      .filter((e) => e.tool_name === toolName)
      .slice(-count);
  }

  /**
   * Get circuit breaker stats for a tool
   */
  getCircuitStats(toolName: string) {
    return circuitBreakerRegistry.getStats(toolName);
  }

  /**
   * Reset circuit breaker for a tool
   */
  resetCircuit(toolName: string): void {
    const breaker = circuitBreakerRegistry.get(toolName);
    breaker.reset();
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}

/**
 * Tool error interface
 */
interface ToolError extends Error {
  toolName: string;
  code: string;
}

// Extend ToolExecution type with optional fields
declare module "../types/agent.js" {
  interface ToolExecution {
    execution_id?: string;
    duration_ms?: number;
    error_type?: string;
  }
}

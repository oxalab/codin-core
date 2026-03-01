/**
 * Error Recovery
 * Ported from src/codin/agent/error_recovery.py
 */

import type { ToolExecution } from "../types/agent.js";

/**
 * Retry strategy configuration
 */
export interface RetryStrategy {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: Set<string>;
}

/**
 * Error Recovery Manager class
 * Manages retry logic for tool execution failures
 */
export class ErrorRecoveryManager {
  private strategy: RetryStrategy;

  constructor(strategy?: Partial<RetryStrategy>) {
    this.strategy = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      retryableErrors: new Set([
        "ETIMEDOUT",
        "ECONNRESET",
        "ECONNREFUSED",
        "ENOTFOUND",
        "EAI_AGAIN",
      ]),
      ...strategy,
    };
  }

  /**
   * Execute a function with retry logic
   */
  async executeWithRetry<TFn extends (...args: unknown[]) => Promise<ToolExecution>>(
    fn: TFn,
    ...args: Parameters<TFn>
  ): Promise<ToolExecution> {
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt < this.strategy.maxAttempts) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error as Error;
        attempt++;

        // Check if error is retryable
        const errorCode = (error as NodeJS.ErrnoException)?.code;
        if (
          !this.strategy.retryableErrors.has(errorCode || "") &&
          !(error as Error).message.includes("timeout")
        ) {
          // Not retryable, break immediately
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.strategy.baseDelay *
            Math.pow(this.strategy.backoffMultiplier, attempt - 1),
          this.strategy.maxDelay
        );

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // All retries exhausted or non-retryable error
    return {
      tool_name: "unknown",
      arguments: {},
      result: null,
      timestamp: Date.now(),
      success: false,
      error: lastError?.message || "Unknown error",
    };
  }

  /**
   * Check if an execution should be retried
   */
  shouldRetry(execution: ToolExecution): boolean {
    if (execution.success) {
      return false;
    }

    const error = execution.error;
    if (!error) {
      return false;
    }

    // Check for retryable error codes
    for (const code of this.strategy.retryableErrors) {
      if (error.includes(code)) {
        return true;
      }
    }

    // Check for timeout
    if (error.toLowerCase().includes("timeout")) {
      return true;
    }

    return false;
  }

  /**
   * Get current retry strategy
   */
  getStrategy(): RetryStrategy {
    return { ...this.strategy };
  }

  /**
   * Update retry strategy
   */
  updateStrategy(updates: Partial<RetryStrategy>): void {
    this.strategy = { ...this.strategy, ...updates };
  }
}

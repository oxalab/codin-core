/**
 * Circuit Breaker for Tool Execution
 * Prevents cascading failures by temporarily disabling failing tools
 */

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = "closed", // Tool working normally
  OPEN = "open", // Tool failing, requests blocked
  HALF_OPEN = "half_open", // Testing if tool recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  failureThreshold: number; // Failures before opening
  successThreshold: number; // Successes to close circuit
  timeoutMs: number; // Time before trying again (half-open)
  halfOpenMaxCalls: number; // Max calls in half-open state
}

/**
 * Circuit breaker statistics
 */
export interface CircuitStats {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  openedAt?: number;
  totalCalls: number;
  totalFailures: number;
}

/**
 * Circuit Breaker class for a single tool
 */
export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private openedAt: number = 0;
  private totalCalls: number = 0;
  private totalFailures: number = 0;
  private halfOpenCalls: number = 0;

  constructor(
    private readonly toolName: string,
    private readonly config: CircuitBreakerConfig = DEFAULT_CONFIG,
  ) {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T> | T): Promise<T> {
    this.totalCalls++;

    // Check if circuit is open
    if (this.state === CircuitState.OPEN) {
      if (Date.now() - this.openedAt > this.config.timeoutMs) {
        // Try again - move to half-open
        this.state = CircuitState.HALF_OPEN;
        this.halfOpenCalls = 0;
      } else {
        // Circuit still open - throw error
        throw new CircuitBreakerOpenError(
          this.toolName,
          this.config.timeoutMs - (Date.now() - this.openedAt),
        );
      }
    }

    // Check half-open call limit
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        throw new CircuitBreakerOpenError(
          this.toolName,
          this.config.timeoutMs - (Date.now() - this.openedAt),
        );
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.close();
      }
    } else {
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.totalFailures++;
    this.failureCount++;

    if (this.failureCount >= this.config.failureThreshold) {
      this.open();
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Go back to open if fails in half-open
      this.open();
    }
  }

  /**
   * Open the circuit (block requests)
   */
  private open(): void {
    this.state = CircuitState.OPEN;
    this.openedAt = Date.now();
    this.failureCount = 0;
    this.successCount = 0;
  }

  /**
   * Close the circuit (allow requests)
   */
  private close(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
  }

  /**
   * Reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.totalCalls = 0;
    this.totalFailures = 0;
    this.halfOpenCalls = 0;
  }

  /**
   * Get current statistics
   */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      openedAt: this.openedAt > 0 ? this.openedAt : undefined,
      totalCalls: this.totalCalls,
      totalFailures: this.totalFailures,
    };
  }

  /**
   * Check if circuit is allowing requests
   */
  isClosed(): boolean {
    return this.state === CircuitState.CLOSED;
  }
}

/**
 * Error thrown when circuit is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(toolName: string, retryAfter: number) {
    super(`Tool '${toolName}' is temporarily disabled due to repeated failures. Retry after ${Math.ceil(retryAfter / 1000)}s`);
    this.name = "CircuitBreakerOpenError";
    this.toolName = toolName;
    this.retryAfter = retryAfter;
  }

  readonly toolName: string;
  readonly retryAfter: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5, // Open after 5 failures
  successThreshold: 2, // Close after 2 successes
  timeoutMs: 60_000, // 1 minute timeout
  halfOpenMaxCalls: 3, // Max 3 test calls in half-open
};

/**
 * Circuit Breaker Registry
 * Manages circuit breakers for all tools
 */
export class CircuitBreakerRegistry {
  private breakers: Map<string, CircuitBreaker> = new Map();
  private configOverrides: Map<string, Partial<CircuitBreakerConfig>> = new Map();

  /**
   * Get or create circuit breaker for a tool
   */
  get(toolName: string): CircuitBreaker {
    if (!this.breakers.has(toolName)) {
      const config = this.configOverrides.get(toolName);
      this.breakers.set(toolName, new CircuitBreaker(toolName, config ? { ...DEFAULT_CONFIG, ...config } : DEFAULT_CONFIG));
    }
    return this.breakers.get(toolName)!;
  }

  /**
   * Set custom config for a tool
   */
  setConfig(toolName: string, config: Partial<CircuitBreakerConfig>): void {
    this.configOverrides.set(toolName, config);
    // Reset breaker if exists to apply new config
    if (this.breakers.has(toolName)) {
      this.breakers.delete(toolName);
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }

  /**
   * Get stats for all tools
   */
  getAllStats(): Record<string, CircuitStats> {
    const stats: Record<string, CircuitStats> = {};
    for (const [name, breaker] of this.breakers.entries()) {
      stats[name] = breaker.getStats();
    }
    return stats;
  }

  /**
   * Get stats for a specific tool
   */
  getStats(toolName: string): CircuitStats | undefined {
    return this.breakers.get(toolName)?.getStats();
  }
}

/**
 * Global registry instance
 */
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Lifecycle Management
 * Handles graceful shutdown and cleanup procedures
 */

// ============================================================================
// Types
// ============================================================================

export interface ShutdownHook {
  priority: number;  // Lower = runs earlier (0-100)
  name: string;
  fn: () => Promise<void>;
  timeout_ms: number;
}

export interface OperationTracker {
  trackOperation(operationId: string): void;
  completeOperation(operationId: string): void;
  getActiveOperations(): string[];
  waitForCompletion(timeout_ms?: number): Promise<boolean>;
}

// ============================================================================
// Shutdown Manager
// ============================================================================

class ShutdownManager {
  private hooks: ShutdownHook[] = [];
  private _isShuttingDown = false;
  private shutdownSignal: "SIGTERM" | "SIGINT" | "NONE" = "NONE";

  /**
   * Register a shutdown hook
   * Hooks run in priority order (lower priority = earlier)
   */
  registerHook(
    name: string,
    priority: number,
    fn: () => Promise<void>,
    timeout_ms = 5000
  ): void {
    if (this._isShuttingDown) {
      return;
    }

    this.hooks.push({ name, priority, fn, timeout_ms });
    this.hooks.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Unregister a shutdown hook
   */
  unregisterHook(name: string): void {
    this.hooks = this.hooks.filter((h) => h.name !== name);
  }

  /**
   * Initiate graceful shutdown
   */
  async shutdown(signal: "SIGTERM" | "SIGINT" = "SIGTERM"): Promise<void> {
    if (this._isShuttingDown) {
      return;
    }

    this._isShuttingDown = true;
    this.shutdownSignal = signal;

    const results: Array<{ name: string; success: boolean; error?: string }> = [];

    for (const hook of this.hooks) {
      try {
        // Run with timeout
        await Promise.race([
          hook.fn(),
          new Promise<void>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), hook.timeout_ms)
          ),
        ]);

        results.push({ name: hook.name, success: true });
      } catch (error) {
        const errorMsg = (error as Error).message;

        results.push({
          name: hook.name,
          success: false,
          error: errorMsg,
        });
      }
    }

    this._isShuttingDown = false;
  }

  /**
   * Check if shutdown is in progress
   */
  isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  /**
   * Get the signal that triggered shutdown
   */
  getSignal(): "SIGTERM" | "SIGINT" | "NONE" {
    return this.shutdownSignal;
  }
}

const shutdownManager = new ShutdownManager();

// ============================================================================
// Operation Tracker
// ============================================================================

class OperationTrackerImpl implements OperationTracker {
  private operations = new Map<string, number>();

  trackOperation(operationId: string): void {
    this.operations.set(operationId, Date.now());
  }

  completeOperation(operationId: string): void {
    const tracked = this.operations.get(operationId);
    if (tracked) {
      this.operations.delete(operationId);
    }
  }

  getActiveOperations(): string[] {
    return Array.from(this.operations.keys());
  }

  async waitForCompletion(timeout_ms = 30000): Promise<boolean> {
    const startTime = Date.now();

    while (this.operations.size > 0) {
      if (Date.now() - startTime > timeout_ms) {
        return false;
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    return true;
  }

  get count(): number {
    return this.operations.size;
  }
}

const operationTracker = new OperationTrackerImpl();

// ============================================================================
// Signal Handlers
// ============================================================================

let signalsInstalled = false;

/**
 * Install signal handlers for graceful shutdown
 */
export function installSignalHandlers(): void {
  if (signalsInstalled) {
    return;
  }

  signalsInstalled = true;

  // SIGTERM (standard termination signal)
  process.on("SIGTERM", async () => {
    await shutdownManager.shutdown("SIGTERM");
    process.exit(0);
  });

  // SIGINT (Ctrl+C)
  process.on("SIGINT", async () => {
    await shutdownManager.shutdown("SIGINT");
    process.exit(0);
  });

  // Uncaught exceptions
  process.on("uncaughtException", async (error) => {
    try {
      await shutdownManager.shutdown("SIGTERM");
    } catch {
      // Ignore errors during shutdown
    }

    process.exit(1);
  });

  // Unhandled promise rejections
  process.on("unhandledRejection", async () => {
    // Silently ignore
  });
}

/**
 * Remove signal handlers (for testing)
 */
export function removeSignalHandlers(): void {
  process.removeAllListeners("SIGTERM");
  process.removeAllListeners("SIGINT");
  signalsInstalled = false;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Register a shutdown hook
 * @param name - Name of the hook (for logging)
 * @param priority - Lower = runs earlier (0-100)
 * @param fn - Async function to run during shutdown
 * @param timeout_ms - Maximum time to wait for hook completion
 */
export function registerShutdownHook(
  name: string,
  priority: number,
  fn: () => Promise<void>,
  timeout_ms?: number
): void {
  shutdownManager.registerHook(name, priority, fn, timeout_ms);
}

/**
 * Unregister a shutdown hook
 */
export function unregisterShutdownHook(name: string): void {
  shutdownManager.unregisterHook(name);
}

/**
 * Manually trigger shutdown
 */
export function triggerShutdown(signal: "SIGTERM" | "SIGINT" = "SIGTERM"): Promise<void> {
  return shutdownManager.shutdown(signal);
}

/**
 * Check if system is shutting down
 */
export function isShuttingDown(): boolean {
  return shutdownManager.isShuttingDown();
}

/**
 * Get the operation tracker
 */
export function getOperationTracker(): OperationTracker {
  return operationTracker;
}

/**
 * Track an operation (returns a cleanup function)
 */
export function trackOperation(operationId: string): () => void {
  operationTracker.trackOperation(operationId);
  return () => operationTracker.completeOperation(operationId);
}

/**
 * Wait for all operations to complete
 */
export async function waitForOperations(timeout_ms?: number): Promise<boolean> {
  return operationTracker.waitForCompletion(timeout_ms);
}

// ============================================================================
// Built-in Shutdown Hooks
// ============================================================================

/**
 * Register built-in shutdown hooks for common cleanup
 */
export function registerBuiltInShutdownHooks(): void {
  // Priority 10: Stop accepting new requests
  registerShutdownHook(
    "stop_accepting_requests",
    10,
    async () => {
      // Set a flag that can be checked by request handlers
      (globalThis as any).SHUTTING_DOWN = true;
    },
    1000
  );

  // Priority 30: Wait for in-flight operations
  registerShutdownHook(
    "wait_operations",
    30,
    async () => {
      await operationTracker.waitForCompletion(15000);
    },
    20000
  );

  // Priority 50: Flush logs
  registerShutdownHook(
    "flush_logs",
    50,
    async () => {
      // No-op - logging removed
    },
    5000
  );

  // Priority 70: Persist sessions
  registerShutdownHook(
    "persist_sessions",
    70,
    async () => {
      // Session persistence will be hooked here
    },
    3000
  );

  // Priority 90: Close connections
  registerShutdownHook(
    "close_connections",
    90,
    async () => {
      // Close any open connections (browsers, databases, etc.)
    },
    3000
  );
}

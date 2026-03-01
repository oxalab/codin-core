/**
 * Bash Runner Tool
 *
 * Execute a shell command and return its output.
 * Matches the updated schema with object parameters.
 *
 * Features:
 * - Background job support
 * - Dangerous command blocking
 * - Auto-background timeout
 * - Output truncation for large outputs
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { ToolResult } from "../types/tools.js";

/**
 * Maximum output length before truncation
 */
const MAX_OUTPUT_LENGTH = 30000;

/**
 * Auto-background threshold - commands taking longer move to background
 */
const AUTO_BACKGROUND_THRESHOLD = 60 * 1000; // 1 minute (reference uses 1 min)

/**
 * Dangerous/blocked commands that require explicit permission
 */
const BLOCKED_COMMANDS = new Set([
  // Network/Download tools
  "alias", "aria2c", "axel", "chrome", "curl", "curlie", "firefox",
  "http-prompt", "httpie", "links", "lynx", "nc", "safari", "scp",
  "ssh", "telnet", "w3m", "wget", "xh",
  // System administration
  "doas", "su", "sudo",
  // Package managers (base commands)
  "apk", "apt", "apt-cache", "apt-get", "dnf", "dpkg", "emerge",
  "home-manager", "makepkg", "opkg", "pacman", "paru", "pkg",
  "pkg_add", "pkg_delete", "portage", "rpm", "yay", "yum", "zypper",
  // System modification
  "at", "batch", "chkconfig", "crontab", "fdisk", "mkfs", "mount",
  "parted", "service", "systemctl", "umount",
  // Network configuration
  "firewall-cmd", "ifconfig", "ip", "iptables", "netstat", "pfctl",
  "route", "ufw",
]);

/**
 * Commands with arguments that should be blocked
 */
const BLOCKED_ARG_PATTERNS = [
  { cmd: "apk", args: ["add"] },
  { cmd: "apt", args: ["install"] },
  { cmd: "apt-get", args: ["install"] },
  { cmd: "dnf", args: ["install"] },
  { cmd: "pacman", args: ["-S"], flag: true },
  { cmd: "pkg", args: ["install"] },
  { cmd: "yum", args: ["install"] },
  { cmd: "zypper", args: ["install"] },
  { cmd: "brew", args: ["install"] },
  { cmd: "cargo", args: ["install"] },
  { cmd: "gem", args: ["install"] },
  { cmd: "go", args: ["install"] },
  { cmd: "npm", args: ["install"], blockingArgs: ["--global", "-g"] },
  { cmd: "pnpm", args: ["add"], blockingArgs: ["--global", "-g"] },
  { cmd: "yarn", args: ["global", "add"] },
  { cmd: "pip", args: ["install"], blockingArgs: ["--user"] },
  { cmd: "pip3", args: ["install"], blockingArgs: ["--user"] },
  { cmd: "go", args: ["test"], blockingArgs: ["-exec"] },
];

/**
 * Read-only safe commands that don't require permission
 */
const SAFE_COMMANDS = [
  "ls", "pwd", "echo", "cat", "head", "tail", "grep", "find",
  "which", "where", "type", "git", "git-status", "git-diff",
  "git-log", "git-show", "git-branch", "node", "-v",
];

/**
 * Background job entry
 */
interface BackgroundJob {
  id: string;
  command: string;
  cwd: string;
  description?: string;
  startTime: number;
  child: ReturnType<typeof spawn>;
  stdout: string;
  stderr: string;
  resolved: boolean;
  exitCode?: number | null;
}

/**
 * Active background jobs manager
 */
class BackgroundJobManager {
  private jobs = new Map<string, BackgroundJob>();

  /**
   * Start a new background job
   */
  start(
    command: string,
    cwd: string,
    description?: string,
    child: ReturnType<typeof spawn>
  ): string {
    const id = randomUUID().slice(0, 8);
    const job: BackgroundJob = {
      id,
      command,
      cwd,
      description,
      startTime: Date.now(),
      child,
      stdout: "",
      stderr: "",
      resolved: false,
    };

    this.jobs.set(id, job);

    // Capture output
    child.stdout?.on("data", (data: Buffer) => {
      job.stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      job.stderr += data.toString();
    });

    child.on("close", (code: number | null) => {
      job.resolved = true;
      job.exitCode = code;
    });

    return id;
  }

  /**
   * Get a job by ID
   */
  get(id: string): BackgroundJob | undefined {
    return this.jobs.get(id);
  }

  /**
   * Get output from a job
   */
  getOutput(id: string): { stdout: string; stderr: string; done: boolean; exitCode?: number | null } | null {
    const job = this.jobs.get(id);
    if (!job) return null;
    return {
      stdout: job.stdout,
      stderr: job.stderr,
      done: job.resolved,
      exitCode: job.exitCode,
    };
  }

  /**
   * Kill a background job
   */
  kill(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    job.child.kill();
    job.resolved = true;
    this.jobs.delete(id);
    return true;
  }

  /**
   * Clean up completed jobs
   */
  cleanup(): void {
    for (const [id, job] of this.jobs.entries()) {
      if (job.resolved) {
        this.jobs.delete(id);
      }
    }
  }

  /**
   * Remove a job from tracking
   */
  remove(id: string): void {
    this.jobs.delete(id);
  }
}

/**
 * Global background job manager
 */
const backgroundJobManager = new BackgroundJobManager();

/**
 * Check if a command contains dangerous patterns
 */
function isDangerousCommand(command: string): { dangerous: boolean; reason?: string } {
  const trimmed = command.trim().toLowerCase();
  const parts = trimmed.split(/\s+/);
  const baseCmd = parts[0];

  // Check if base command is blocked
  if (BLOCKED_COMMANDS.has(baseCmd)) {
    return {
      dangerous: true,
      reason: `Command "${baseCmd}" is blocked for security reasons`,
    };
  }

  // Check for blocked argument patterns
  for (const pattern of BLOCKED_ARG_PATTERNS) {
    if (baseCmd === pattern.cmd || trimmed.startsWith(`${pattern.cmd} `)) {
      // Check if the args are present
      const hasArgs = pattern.args.some(arg =>
        parts.includes(arg)
      );
      if (hasArgs) {
        // Check for blocking args (must NOT have these)
        const hasBlockingArgs = pattern.blockingArgs?.some(ba =>
          parts.includes(ba)
        );
        if (!pattern.blockingArgs || hasBlockingArgs) {
          return {
            dangerous: true,
            reason: `Command "${pattern.cmd} ${pattern.args.join(" ")}" is blocked for security reasons`,
          };
        }
      }
      // Check for flag patterns (e.g., pacman -S)
      if (pattern.flag && pattern.args.some(arg => parts.includes(arg))) {
        return {
          dangerous: true,
          reason: `Command "${pattern.cmd}" with package installation flag is blocked`,
        };
      }
    }
  }

  return { dangerous: false };
}

/**
 * Check if a command is safe (read-only)
 */
function isSafeCommand(command: string): boolean {
  const trimmed = command.trim().toLowerCase();
  return SAFE_COMMANDS.some(safe =>
    trimmed === safe || trimmed.startsWith(`${safe} `) || trimmed.startsWith(`${safe}-`)
  );
}

/**
 * Truncate output if too large
 */
function truncateOutput(content: string): string {
  if (content.length <= MAX_OUTPUT_LENGTH) {
    return content;
  }

  const halfLength = Math.floor(MAX_OUTPUT_LENGTH / 2);
  const start = content.slice(0, halfLength);
  const end = content.slice(-halfLength);
  const truncatedLines = content.slice(halfLength, -halfLength).split("\n").length;

  return `${start}\n\n... [${truncatedLines} lines truncated] ...\n\n${end}`;
}

/**
 * Format command output with error handling
 */
function formatOutput(stdout: string, stderr: string, exitCode: number | null): string {
  const truncatedStdout = truncateOutput(stdout);
  const truncatedStderr = truncateOutput(stderr);

  let output = "";

  if (truncatedStdout) {
    output += truncatedStdout;
  }

  if (truncatedStderr) {
    if (output) output += "\n";
    output += truncatedStderr;
  }

  if (exitCode !== null && exitCode !== 0) {
    if (output) output += "\n";
    output += `Exit code: ${exitCode}`;
  }

  return output || "no output";
}

/**
 * Result interface for bash_runner
 */
interface BashResult extends ToolResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  timeout?: boolean;
  error?: string;
  background?: boolean;
  shellId?: string;
}

/**
 * Input parameters for bash (matches schema)
 */
export interface BashInput {
  command: string;
  timeout_seconds?: number;
  description?: string;
  working_directory?: string;
  run_in_background?: boolean;
}

/**
 * Kill a background job
 */
export function killBackgroundJob(shellId: string): { success: boolean; error?: string } {
  const killed = backgroundJobManager.kill(shellId);
  if (!killed) {
    return {
      success: false,
      error: `Background job ${shellId} not found`,
    };
  }
  return { success: true };
}

/**
 * Get output from a background job
 */
export function getBackgroundJobOutput(shellId: string): {
  success: boolean;
  output?: string;
  done?: boolean;
  exitCode?: number | null;
  error?: string;
} {
  const job = backgroundJobManager.get(shellId);
  if (!job) {
    return {
      success: false,
      error: `Background job ${shellId} not found`,
    };
  }

  const result = backgroundJobManager.getOutput(shellId);
  if (!result) {
    return {
      success: false,
      error: `Could not get output for job ${shellId}`,
    };
  }

  return {
    success: true,
    output: formatOutput(result.stdout, result.stderr, result.exitCode),
    done: result.done,
    exitCode: result.exitCode,
  };
}

/**
 * List all background jobs
 */
export function listBackgroundJobs(): Array<{
  id: string;
  command: string;
  cwd: string;
  startTime: number;
  done: boolean;
}> {
  backgroundJobManager.cleanup();
  const jobs: ReturnType<typeof listBackgroundJobs> = [];

  for (const job of backgroundJobManager["jobs"].values()) {
    jobs.push({
      id: job.id,
      command: job.command,
      cwd: job.cwd,
      startTime: job.startTime,
      done: job.resolved,
    });
  }

  return jobs;
}

/**
 * Execute a bash command
 * @param input - Bash parameters as an object
 * @returns Command output or error
 */
export async function bashRunner(input: BashInput): Promise<BashResult> {
  const {
    command,
    timeout_seconds = 120,
    description,
    working_directory,
    run_in_background = false
  } = input;

  // Validate command
  if (!command || command.trim() === "") {
    return {
      success: false,
      error: "Command is required",
    };
  }

  // Check for dangerous commands
  const dangerousCheck = isDangerousCommand(command);
  if (dangerousCheck.dangerous && !isSafeCommand(command)) {
    return {
      success: false,
      error: dangerousCheck.reason || "Command is blocked for security reasons",
    };
  }

  const cwd = working_directory || process.cwd?.();

  return new Promise<BashResult>((resolve) => {
    let child: ReturnType<typeof spawn>;

    if (process.platform === "win32") {
      child = spawn("cmd.exe", ["/c", command], {
        cwd,
        windowsHide: true,
      });
    } else {
      child = spawn("bash", ["-c", command], {
        cwd,
        windowsHide: false,
      });
    }

    let stdout = "";
    let stderr = "";
    let resolved = false;

    // Handle explicit background request
    if (run_in_background) {
      const shellId = backgroundJobManager.start(command, cwd, description, child);

      // Wait a short time to detect fast failures
      const fastFailTimeout = setTimeout(() => {
        if (resolved) return;
        resolved = true;

        const job = backgroundJobManager.get(shellId);
        if (job && job.resolved) {
          // Job completed quickly - return result
          backgroundJobManager.remove(shellId);
          resolve({
            success: job.exitCode === 0,
            stdout: job.stdout.trim(),
            stderr: job.stderr.trim(),
            exitCode: job.exitCode,
            background: false,
          });
        } else {
          // Still running - return as background job
          resolve({
            success: true,
            background: true,
            shellId,
            error: `Background shell started with ID: ${shellId}\n\nUse getBackgroundJobOutput() to view output or killBackgroundJob() to terminate.`,
          });
        }
      }, 1000);

      child.on("close", (code: number | null) => {
        clearTimeout(fastFailTimeout);
        if (!resolved) {
          resolved = true;
          const job = backgroundJobManager.get(shellId);
          if (job) {
            job.resolved = true;
            job.exitCode = code;
          }
        }
      });

      child.on("error", (error: Error) => {
        clearTimeout(fastFailTimeout);
        if (resolved) return;
        resolved = true;
        backgroundJobManager.remove(shellId);
        resolve({
          success: false,
          error: `Failed to spawn process: ${error.message}`,
        });
      });

      return;
    }

    // Normal execution with auto-background support
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;

      // Move to background instead of killing
      const shellId = backgroundJobManager.start(command, cwd, description, child);

      // Transfer accumulated output
      const job = backgroundJobManager.get(shellId);
      if (job) {
        job.stdout = stdout;
        job.stderr = stderr;
      }

      resolve({
        success: true,
        background: true,
        shellId,
        error: `Command is taking longer than expected and has been moved to background.\n\nBackground shell ID: ${shellId}\n\nUse getBackgroundJobOutput() to view output or killBackgroundJob() to terminate.`,
      });
    }, Math.min(timeout_seconds * 1000, AUTO_BACKGROUND_THRESHOLD));

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", (error: Error) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      resolve({
        success: false,
        error: `Failed to spawn process: ${error.message}`,
      });
    });

    child.on("close", (code: number | null) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve({
          success: true,
          stdout: formatOutput(stdout, stderr, code),
          stderr: stderr.trim(),
          exitCode: code,
        });
      } else if (code === null || code === undefined) {
        if (stdout || stderr) {
          resolve({
            success: true,
            stdout: formatOutput(stdout, stderr, code),
            stderr: stderr.trim(),
            exitCode: code,
          });
        } else {
          resolve({
            success: false,
            error: "Process terminated without output",
            exitCode: code,
          });
        }
      } else {
        resolve({
          success: false,
          stdout: formatOutput(stdout, stderr, code),
          stderr: stderr.trim(),
          exitCode: code,
          error: stderr?.trim() || `Command exited with code ${code}`,
        });
      }
    });
  });
}

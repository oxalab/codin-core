/**
 * Git Tools
 *
 * Git status and diff operations.
 * Matches the updated schema with staged/cached/commit parameters.
 */

import { spawn } from "node:child_process";

import type { ToolResult } from "../types/tools.js";

/**
 * Result interface for git_status
 */
interface GitStatusResult extends ToolResult {
  status?: string;
  branch?: string;
  error?: string;
}

/**
 * Result interface for git_diff
 */
interface GitDiffResult extends ToolResult {
  diff?: string;
  path?: string;
  error?: string;
}

/**
 * Input parameters for git_status (matches schema)
 */
export interface GitStatusInput {
  working_directory?: string;
}

/**
 * Get git status of repository
 * Shows modified, added, and deleted files
 * @param input - Git status parameters as an object
 * @returns Git status output or error
 */
export async function gitStatus(input?: GitStatusInput): Promise<GitStatusResult> {
  const workingDirectory = input?.working_directory;
  return new Promise<GitStatusResult>((resolve, reject) => {
    const child = spawn("git", ["status", "--short"], {
      cwd: workingDirectory || process.cwd?.(),
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve({
          success: true,
          status: stdout.trim() || "No changes",
        });
      } else if (code === 128) {
        // Not a git repository
        resolve({
          success: true,
          status: "",
          error: "Not a git repository",
        });
      } else {
        resolve({
          success: false,
          error: stderr?.trim() || `git status exited with code ${code}`,
        });
      }
    });

    child.on("error", (error: Error) => {
      reject({
        success: false,
        error: `Failed to run git status: ${(error as Error).message}`,
      });
    });
  });
}

/**
 * Input parameters for git_diff (matches schema)
 */
export interface GitDiffInput {
  path?: string;
  staged?: boolean;
  cached?: boolean;
  commit?: string;
  working_directory?: string;
}

/**
 * Get git diff of tracked files
 * Shows changes in tracked files
 * @param input - Git diff parameters as an object
 * @returns Git diff output or error
 */
export async function gitDiff(input: GitDiffInput = {}): Promise<GitDiffResult> {
  const { path, staged = false, cached, commit, working_directory } = input;

  return new Promise<GitDiffResult>((resolve, reject) => {
    const args = ["diff"];

    // Handle staged/cached (both show staged changes)
    if (staged || cached) {
      args.push("--staged");
    }

    // Handle comparing against a specific commit
    if (commit) {
      args.push(commit);
    }

    // Add path separator and path
    if (path) {
      args.push("--");
      args.push(path);
    }

    const child = spawn("git", args, {
      cwd: working_directory || process.cwd?.(),
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("close", (code: number | null) => {
      if (code === 0) {
        resolve({
          success: true,
          diff: stdout.trim() || "No changes",
          path,
        });
      } else if (code === 128) {
        // Not a git repository
        resolve({
          success: true,
          diff: "",
          path,
          error: "Not a git repository",
        });
      } else {
        resolve({
          success: false,
          error: stderr?.trim() || `git diff exited with code ${code}`,
        });
      }
    });

    child.on("error", (error: Error) => {
      reject({
        success: false,
        error: `Failed to run git diff: ${(error as Error).message}`,
      });
    });
  });
}

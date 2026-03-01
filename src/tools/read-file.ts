/**
 * Read File Tool
 *
 * Read the contents of a file from the filesystem.
 * Matches the updated schema with object parameters.
 */

import { readFile as fsReadFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolvePath, isSafePath } from "../utils/fs.js";
import { recordFileRead } from "../utils/file-tracker.js";
import type { ToolResult } from "../types/tools.js";

/**
 * Result interface for read_file
 */
interface ReadFileResult extends ToolResult {
  content?: string;
  path: string;
  size?: number;
  error?: string;
}

/**
 * Input parameters for read_file (matches schema)
 */
export interface ReadFileInput {
  path: string;
  offset?: number;
  limit?: number;
  working_directory?: string;
}

/**
 * Read a file and return its contents
 * @param input - Read file parameters as an object
 * @returns File contents or error
 */
export async function readFile(input: ReadFileInput): Promise<ReadFileResult> {
  const { path, offset, limit, working_directory } = input;
  try {
    const wd = working_directory || process.cwd?.() || "";
    const filePath = resolvePath(path, wd);

    // Safety check
    if (!isSafePath(filePath, wd)) {
      return {
        success: false,
        error: `Path ${path} is outside working directory`,
        path: String(filePath),
      };
    }

    // Check if exists
    try {
      await fsReadFile(filePath, "utf-8");
    } catch {
      return {
        success: false,
        error: `Path does not exist: ${path}`,
        path: String(filePath),
      };
    }

    // Check if it's a file (not directory)
    // In Node.js, we need to use fs.stat for this check
    const { stat } = await import("node:fs/promises");
    const stats = await stat(filePath);

    if (!stats.isFile()) {
      return {
        success: false,
        error: `Path is not a file: ${path}`,
        path: String(filePath),
      };
    }

    // Read file
    let content = await fsReadFile(filePath, "utf-8");
    const size = stats.size;

    // Record this file read for edit safety checks
    recordFileRead(filePath, Math.floor(stats.mtime.getTime() / 1000));

    // Apply offset/limit pagination if provided
    if (offset !== undefined || limit !== undefined) {
      const lines = content.split("\n");
      const startLine = offset !== undefined ? offset - 1 : 0; // Convert to 0-indexed
      const endLine = limit !== undefined ? startLine + limit : lines.length;

      content = lines.slice(startLine, endLine).join("\n");
    }

    return {
      success: true,
      content,
      path: String(filePath),
      size,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "EACCES" || err.code === "EPERM") {
      return {
        success: false,
        error: `Permission denied: ${path}`,
        path,
      };
    }

    if (err.code === "EISDIR") {
      return {
        success: false,
        error: `Path is a directory: ${path}`,
        path,
      };
    }

    return {
      success: false,
      error: `Error reading file: ${(error as Error).message}`,
      path,
    };
  }
}

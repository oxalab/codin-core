/**
 * List Files Tool
 *
 * List files and directories at a given path.
 * Matches the updated schema with object parameters.
 */

import { stat, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { resolvePath, isSafePath } from "../utils/fs.js";
import type { ToolResult } from "../types/tools.js";

/**
 * File info interface
 */
interface FileInfo {
  path: string;
  name: string;
  type: "file" | "directory";
  size?: number;
  modified: number;
}

/**
 * Result interface for list_files
 */
interface ListFilesResult extends ToolResult {
  files?: FileInfo[];
  path?: string;
  count?: number;
  error?: string;
}

/**
 * Input parameters for list_files (matches schema)
 */
export interface ListFilesInput {
  path?: string;
  recursive?: boolean;
  include_hidden?: boolean;
  working_directory?: string;
}

/**
 * List files and directories
 * @param input - List files parameters as an object
 * @returns List of files or error
 */
export async function listFiles(input: ListFilesInput = {}): Promise<ListFilesResult> {
  const {
    path = ".",
    recursive = false,
    include_hidden = false,
    working_directory
  } = input;

  try {
    const wd = working_directory || process.cwd?.() || "";
    const dirPath = resolvePath(path, wd);

    // Safety check
    if (!isSafePath(dirPath, wd)) {
      return {
        success: false,
        error: `Path ${path} is outside working directory`,
        path: String(dirPath),
      };
    }

    // Check if exists
    try {
      const stats = await stat(dirPath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Path is not a directory: ${path}`,
          path: String(dirPath),
        };
      }
    } catch {
      return {
        success: false,
        error: `Directory not found: ${path}`,
        path: String(dirPath),
      };
    }

    const files: FileInfo[] = [];
    const pattern = recursive ? "**/*" : "*";

    // Read directory
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files if not requested
      if (!include_hidden && entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = resolve(dirPath, entry.name);

      // Skip if outside working directory
      if (!isSafePath(fullPath, wd)) {
        continue;
      }

      try {
        const stats = await stat(fullPath);

        files.push({
          path: entry.name,
          name: entry.name,
          type: stats.isDirectory() ? "directory" : "file",
          size: stats.isFile() ? stats.size : undefined,
          modified: stats.mtimeMs,
        });
      } catch {
        // Skip files we can't read (permission errors, etc.)
        continue;
      }
    }

    // Sort by path
    files.sort((a, b) => a.path.localeCompare(b.path));

    return {
      success: true,
      files,
      path: String(dirPath),
      count: files.length,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "EACCES" || err.code === "EPERM") {
      return {
        success: false,
        error: `Permission denied: ${path}`,
      };
    }

    return {
      success: false,
      error: `Error listing files: ${(error as Error).message}`,
    };
  }
}

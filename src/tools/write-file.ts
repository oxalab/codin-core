/**
 * Write File Tool
 *
 * Write content to a file, creating it if it doesn't exist.
 * Matches the updated schema with object parameters.
 */

import { writeFile as fsWriteFile, mkdir, stat } from "node:fs/promises";
import { resolve, dirname } from "node:path";

import { resolvePath, ensureParentDir, isSafePath } from "../utils/fs.js";
import type { ToolResult } from "../types/tools.js";

/**
 * Result interface for write_file
 */
interface WriteFileResult extends ToolResult {
  path?: string;
  size?: number;
  created?: boolean;
  error?: string;
}

/**
 * Input parameters for write_file (matches schema)
 */
export interface WriteFileInput {
  path: string;
  contents: string;
  create_if_missing?: boolean;
  working_directory?: string;
}

/**
 * Write contents to a file
 * @param input - Write file parameters as an object
 * @returns Result object
 */
export async function writeFile(input: WriteFileInput): Promise<WriteFileResult> {
  const { path, contents, create_if_missing = true, working_directory } = input;
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

    // Check if file exists
    let fileExists = false;
    try {
      const stats = await stat(filePath);
      fileExists = true;
    } catch {
      fileExists = false;
    }

    if (!create_if_missing && !fileExists) {
      return {
        success: false,
        error: `File does not exist and create_if_missing is false: ${path}`,
        path: String(filePath),
      };
    }

    // Ensure parent directory exists
    ensureParentDir(filePath);

    // Write file
    await fsWriteFile(filePath, contents, "utf-8");

    const size = Buffer.byteLength(contents, "utf-8");

    return {
      success: true,
      path: String(filePath),
      size,
      created: !fileExists,
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

    return {
      success: false,
      error: `OS error: ${(error as Error).message}`,
      path,
    };
  }
}

/**
 * Edit File Tool
 *
 * Replaces exact text in a file with new text.
 * Matches the updated schema with old_string/new_string parameters.
 *
 * Features:
 * - Read-before-edit safety check
 * - Concurrent edit detection via mod-time
 * - Multi-occurrence detection with replace_all option
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { resolvePath, isSafePath } from "../utils/fs.js";
import { wasFileRead, wasFileModifiedSinceRead, recordFileRead } from "../utils/file-tracker.js";
import type { ToolResult } from "../types/tools.js";

/**
 * Result interface for edit_file
 */
interface EditFileResult extends ToolResult {
  path?: string;
  replaced?: boolean;
  replacements?: number;
  error?: string;
  additions?: number;
  removals?: number;
  modTimeCheck?: {
    wasModified: boolean;
    lastRead: number;
    modTime: number;
  };
}

/**
 * Input parameters for edit_file (matches schema)
 */
export interface EditFileInput {
  path: string;
  old_string: string;
  new_string: string;
  replace_all?: boolean;
  working_directory?: string;
  skip_read_check?: boolean;
}

/**
 * Count line differences for diff summary
 */
function countLineDifferences(oldContent: string, newContent: string): { additions: number; removals: number } {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");

  // Simple line count difference (proper diff would be more complex)
  const additions = Math.max(0, newLines.length - oldLines.length);
  const removals = Math.max(0, oldLines.length - newLines.length);

  return { additions, removals };
}

/**
 * Replace exact text in a file with new text
 * @param input - Edit parameters as an object
 * @returns Edit result or error
 */
export async function editFile(input: EditFileInput): Promise<EditFileResult> {
  const { path, old_string, new_string, replace_all = false, working_directory, skip_read_check = false } = input;

  try {
    const wd = working_directory || process.cwd?.() || "";
    const filePath = resolvePath(path, wd);

    // Safety check: path is within working directory
    if (!isSafePath(filePath, wd)) {
      return {
        success: false,
        error: `Path ${path} is outside working directory`,
        path,
      };
    }

    // Safety check: file must be read before editing
    if (!skip_read_check && !wasFileRead(filePath)) {
      return {
        success: false,
        error: `You must read the file before editing it. Use read_file tool first.`,
        path,
      };
    }

    // Safety check: detect concurrent edits
    const wasModified = !skip_read_check && await wasFileModifiedSinceRead(filePath);
    if (wasModified) {
      const stats = await stat(filePath);
      return {
        success: false,
        error: `File ${path} has been modified since it was last read. Please re-read the file before editing.`,
        path,
        modTimeCheck: {
          wasModified: true,
          lastRead: 0, // Would be populated from tracker
          modTime: Math.floor(stats.mtime.getTime() / 1000),
        },
      };
    }

    // Read original file
    let content: string;
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      return {
        success: false,
        error: `File not found: ${path}`,
        path,
      };
    }

    // Normalize line endings for comparison
    const normalizedContent = content.replace(/\r\n/g, "\n");
    const normalizedOldString = old_string.replace(/\r\n/g, "\n");
    const normalizedNewString = new_string.replace(/\r\n/g, "\n");

    // Check if old_string exists in content
    if (!normalizedContent.includes(normalizedOldString)) {
      return {
        success: false,
        error: `Could not find the specified text to replace in ${path}. Make sure it matches exactly, including whitespace.`,
        path,
      };
    }

    // Check for multiple occurrences if replace_all is false
    let newContent: string;
    let replacements: number;

    if (replace_all) {
      // Count occurrences first
      const count = (normalizedContent.match(new RegExp(escapeRegExp(normalizedOldString), "g")))?.length ?? 0;
      replacements = count;

      // Replace all occurrences
      const regex = new RegExp(escapeRegExp(normalizedOldString), "g");
      newContent = normalizedContent.replace(regex, normalizedNewString);
    } else {
      // Check if there are multiple occurrences
      const firstIndex = normalizedContent.indexOf(normalizedOldString);
      const lastIndex = normalizedContent.lastIndexOf(normalizedOldString);

      if (firstIndex !== lastIndex) {
        return {
          success: false,
          error: `The specified text appears multiple times in ${path}. Please provide more context to ensure a unique match, or set replace_all to true.`,
          path,
        };
      }

      replacements = 1;
      newContent = normalizedContent.replace(normalizedOldString, normalizedNewString);
    }

    // Check if content actually changed
    if (normalizedContent === newContent) {
      return {
        success: false,
        error: `No changes made - new content is identical to old content.`,
        path,
      };
    }

    // Restore original line endings if file had CRLF
    const hasCrLf = content.includes("\r\n");
    if (hasCrLf) {
      newContent = newContent.replace(/\n/g, "\r\n");
    }

    // Write updated content
    await writeFile(filePath, newContent, "utf-8");

    // Record the edit as a "read" for next edit
    const newStats = await stat(filePath);
    recordFileRead(filePath, Math.floor(newStats.mtime.getTime()));

    // Calculate diff stats
    const { additions, removals } = countLineDifferences(content, newContent);

    return {
      success: true,
      path,
      replaced: true,
      replacements,
      additions,
      removals,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "EACCES" || err.code === "EPERM") {
      return {
        success: false,
        error: `Permission denied: ${err.message}`,
        path,
      };
    }

    return {
      success: false,
      error: `Error editing file: ${(error as Error).message}`,
      path,
    };
  }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Multi Edit Tool
 *
 * Apply multiple edits across one or more files in a single atomic operation.
 * Matches the updated schema with object parameters.
 *
 * Features:
 * - Partial failure handling (continues on error)
 * - Better error reporting
 * - Diff statistics tracking
 */

import { readFile, writeFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { resolvePath, isSafePath } from "../utils/fs.js";
import { wasFileRead, wasFileModifiedSinceRead, recordFileRead } from "../utils/file-tracker.js";
import type { ToolResult } from "../types/tools.js";

/**
 * Edit item interface
 */
interface EditItem {
  path: string;
  patch: string;
}

/**
 * Failed edit detail
 */
interface FailedEdit {
  index: number;
  path: string;
  error: string;
}

/**
 * Result interface for multi_edit
 */
interface MultiEditResult extends ToolResult {
  edits?: Array<{
    path: string;
    success: boolean;
    error?: string;
    additions?: number;
    removals?: number;
  }>;
  count?: number;
  applied?: number;
  failed?: number;
  error?: string;
  failedEdits?: FailedEdit[];
}

/**
 * Input parameters for multi_edit (matches schema)
 */
export interface MultiEditInput {
  edits: EditItem[];
  commit_message?: string;
  working_directory?: string;
}

/**
 * Parse unified diff patch to extract old/new content
 */
function parseUnifiedDiff(patch: string): { oldContent: string; newContent: string; error?: string } {
  const lines = patch.split("\n");
  let oldContent = "";
  let newContent = "";
  let inOld = false;
  let inNew = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      // File headers - skip
      continue;
    } else if (line.startsWith("@@ ")) {
      // Hunk header - start of changes
      inOld = true;
      inNew = true;
    } else if (line.startsWith("- ") || (line.startsWith("-") && !line.startsWith("---"))) {
      // Removal line
      oldContent += line.substring(1) + "\n";
    } else if (line.startsWith("+ ") || (line.startsWith("+") && !line.startsWith("+++"))) {
      // Addition line
      newContent += line.substring(1) + "\n";
    } else if (line.startsWith(" ") || line.trim() === "") {
      // Context line or empty - add to both
      if (inOld || inNew) {
        oldContent += line.substring(1) + "\n";
        newContent += line.substring(1) + "\n";
      }
    }
  }

  if (!oldContent && !newContent) {
    return { oldContent: "", newContent: "", error: "Could not parse patch - no changes found" };
  }

  return { oldContent: oldContent.trimEnd(), newContent: newContent.trimEnd() };
}

/**
 * Count line differences
 */
function countLineDifferences(oldContent: string, newContent: string): { additions: number; removals: number } {
  const oldLines = oldContent.split("\n");
  const newLines = newContent.split("\n");
  const additions = Math.max(0, newLines.length - oldLines.length);
  const removals = Math.max(0, oldLines.length - newLines.length);
  return { additions, removals };
}

/**
 * Apply a single edit to a file
 */
async function applySingleEdit(
  edit: EditItem,
  wd: string,
  index: number
): Promise<{ success: boolean; error?: string; additions?: number; removals?: number }> {
  const filePath = resolvePath(edit.path, wd);

  // Safety check
  if (!isSafePath(filePath, wd)) {
    return {
      success: false,
      error: "Path is outside working directory",
    };
  }

  // Check if file exists
  let stats: ReturnType<typeof stat.prototype> | undefined;
  try {
    stats = await stat(filePath);
  } catch {
    return {
      success: false,
      error: "File not found",
    };
  }

  // Safety check: file must be read before editing
  if (!wasFileRead(filePath)) {
    return {
      success: false,
      error: "You must read the file before editing it. Use read_file tool first.",
    };
  }

  // Safety check: detect concurrent edits
  const wasModified = await wasFileModifiedSinceRead(filePath);
  if (wasModified) {
    return {
      success: false,
      error: "File has been modified since it was last read. Please re-read the file before editing.",
    };
  }

  // Read file content
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (err) {
    return {
      success: false,
      error: `Failed to read file: ${(err as Error).message}`,
    };
  }

  // Parse patch
  const { oldContent, newContent, error: parseError } = parseUnifiedDiff(edit.patch);
  if (parseError) {
    return {
      success: false,
      error: parseError,
    };
  }

  // Check if old content exists in file
  if (oldContent && !content.includes(oldContent)) {
    return {
      success: false,
      error: "Could not find the content to replace. The file may have been modified.",
    };
  }

  // Apply edit
  let updatedContent = content;
  if (oldContent) {
    updatedContent = content.replace(oldContent, newContent);
  } else {
    // No old content means append
    updatedContent = content + (content.endsWith("\n") ? "" : "\n") + newContent;
  }

  // Check if content changed
  if (updatedContent === content) {
    return {
      success: false,
      error: "No changes made - new content is identical to old content",
    };
  }

  // Write file
  try {
    await writeFile(filePath, updatedContent, "utf-8");
  } catch (err) {
    return {
      success: false,
      error: `Failed to write file: ${(err as Error).message}`,
    };
  }

  // Record the edit as a "read" for next edit
  const newStats = await stat(filePath);
  recordFileRead(filePath, Math.floor(newStats.mtime.getTime() / 1000));

  // Calculate diff stats
  const { additions, removals } = countLineDifferences(content, updatedContent);

  return {
    success: true,
    additions,
    removals,
  };
}

/**
 * Apply multiple edits to multiple files at once
 * Useful for refactoring
 * @param input - Multi-edit parameters as an object
 * @returns Multi-edit result or error
 */
export async function multiEdit(input: MultiEditInput): Promise<MultiEditResult> {
  const { edits, commit_message, working_directory } = input;

  if (!edits || edits.length === 0) {
    return {
      success: false,
      error: "At least one edit is required",
    };
  }

  if (edits.length > 50) {
    return {
      success: false,
      error: "Too many edits - maximum 50 edits per request",
    };
  }

  const wd = working_directory || process.cwd?.() || "";
  const results: MultiEditResult["edits"] = [];
  const failedEdits: FailedEdit[] = [];
  let appliedCount = 0;

  for (let i = 0; i < edits.length; i++) {
    const edit = edits[i];
    const result = await applySingleEdit(edit, wd, i);

    results.push({
      path: edit.path,
      success: result.success,
      error: result.error,
      additions: result.additions,
      removals: result.removals,
    });

    if (result.success) {
      appliedCount++;
    } else {
      failedEdits.push({
        index: i + 1,
        path: edit.path,
        error: result.error || "Unknown error",
      });
    }
  }

  // If all edits failed, return error
  if (appliedCount === 0) {
    return {
      success: false,
      edits: results,
      count: results.length,
      applied: 0,
      failed: results.length,
      error: "All edits failed",
      failedEdits,
    };
  }

  // If some edits failed, return partial success
  if (failedEdits.length > 0) {
    return {
      success: true,
      edits: results,
      count: results.length,
      applied: appliedCount,
      failed: failedEdits.length,
      error: `${failedEdits.length} of ${results.length} edits failed`,
      failedEdits,
    };
  }

  // All edits succeeded
  return {
    success: true,
    edits: results,
    count: results.length,
    applied: appliedCount,
    failed: 0,
  };
}

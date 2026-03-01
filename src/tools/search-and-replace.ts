/**
 * Search and Replace Tool
 *
 * Search for a pattern in a file and replace all occurrences.
 * Supports regex patterns.
 * Matches the updated schema with object parameters.
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolvePath, isSafePath } from "../utils/fs.js";
import type { ToolResult } from "../types/tools.js";

/**
 * Result interface for search_and_replace
 */
interface SearchAndReplaceResult extends ToolResult {
  path?: string;
  replacements?: number;
  error?: string;
}

/**
 * Input parameters for search_and_replace (matches schema)
 */
export interface SearchAndReplaceInput {
  path: string;
  search_pattern: string;
  replace_pattern: string;
  use_regex?: boolean;
  case_sensitive?: boolean;
  working_directory?: string;
}

/**
 * Search and replace text in a file
 * Supports regex patterns
 * @param input - Search and replace parameters as an object
 * @returns Replace result or error
 */
export async function searchAndReplace(input: SearchAndReplaceInput): Promise<SearchAndReplaceResult> {
  const {
    path,
    search_pattern,
    replace_pattern,
    use_regex = true,
    case_sensitive = true,
    working_directory
  } = input;
  try {
    const wd = working_directory || process.cwd?.() || "";
    const filePath = resolvePath(path, wd);

    // Safety check
    if (!isSafePath(filePath, wd)) {
      return {
        success: false,
        error: `Path ${path} is outside working directory`,
        path,
      };
    }

    // Read file
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

    let newContent = content;
    let replacements = 0;

    if (use_regex) {
      // Use regex replacement
      const flags = case_sensitive ? "g" : "gi";
      const regex = new RegExp(search_pattern, flags);

      // Count matches
      const matches = content.match(regex);
      replacements = matches ? matches.length : 0;

      // Replace
      newContent = content.replace(regex, replace_pattern);
    } else {
      // Simple string replacement
      const searchStr = case_sensitive ? search_pattern : new RegExp(search_pattern, "gi");

      // Count matches
      if (case_sensitive) {
        let index = 0;
        while ((index = content.indexOf(search_pattern, index)) !== -1) {
          replacements++;
          index += search_pattern.length;
        }
      } else {
        const regex = new RegExp(search_pattern, "gi");
        const matches = content.match(regex);
        replacements = matches ? matches.length : 0;
      }

      // Replace
      if (case_sensitive) {
        newContent = content.replaceAll(search_pattern, replace_pattern);
      } else {
        const regex = new RegExp(search_pattern, "gi");
        newContent = content.replace(regex, replace_pattern);
      }
    }

    // Write updated content
    await writeFile(filePath, newContent, "utf-8");

    return {
      success: true,
      path,
      replacements,
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
      error: `Error in search_and_replace: ${(error as Error).message}`,
      path,
    };
  }
}

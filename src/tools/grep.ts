/**
 * Grep Tool
 *
 * Search for regex patterns in file contents.
 * Matches the updated schema with case_insensitive parameter.
 *
 * Features:
 * - Ripgrep (rg) fallback for better performance
 * - Literal text mode (escapes regex special chars)
 * - Proper case_insensitive support
 * - Regex caching for repeated patterns
 * - Truncates long output lines
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";

import { resolvePath, isSafePath } from "../utils/fs.js";
import type { ToolResult } from "../types/tools.js";

/**
 * Maximum content width for grep results
 */
const MAX_GREP_CONTENT_WIDTH = 500;

/**
 * Regex cache for compiled patterns
 */
const regexCache = new Map<string, RegExp>();

/**
 * Result interface for grep
 */
interface GrepResult extends ToolResult {
  matches?: Array<{
    path: string;
    line: number;
    char?: number;
    content: string;
    lineNumber: number;
  }>;
  path?: string;
  count?: number;
  truncated?: boolean;
  error?: string;
}

/**
 * Input parameters for grep (matches schema)
 */
export interface GrepInput {
  pattern: string;
  path?: string;
  recursive?: boolean;
  case_insensitive?: boolean;
  include_hidden?: boolean;
  max_results?: number;
  literal_text?: boolean;
  working_directory?: string;
}

/**
 * Escape special regex characters for literal text search
 */
function escapeRegexPattern(pattern: string): string {
  const specialChars = ["\\", ".", "+", "*", "?", "(", ")", "[", "]", "{", "}", "^", "$", "|"];
  let escaped = pattern;
  for (const char of specialChars) {
    escaped = escaped.replace(new RegExp(`\\${char}`, "g"), `\\${char}`);
  }
  return escaped;
}

/**
 * Get or compile a cached regex
 */
function getCachedRegex(pattern: string, flags: string): RegExp | null {
  const key = `${pattern}:${flags}`;
  if (regexCache.has(key)) {
    return regexCache.get(key)!;
  }

  try {
    const regex = new RegExp(pattern, flags);
    regexCache.set(key, regex);
    return regex;
  } catch {
    return null;
  }
}

/**
 * Check if a file is a text file (skip binaries)
 */
async function isTextFile(filePath: string): Promise<boolean> {
  try {
    const { readFile } = await import("node:fs/promises");
    const buffer = await readFile(filePath, { limit: 512 });

    // Check for common binary signatures
    const header = buffer.slice(0, 4);
    const binarySignatures = [
      [0x50, 0x4b, 0x03, 0x04], // ZIP
      [0x1f, 0x8b], // GZIP
      [0x42, 0x5a, 0x68], // BZIP2
      [0x50, 0x4b, 0x05, 0x06], // Empty ZIP
      [0x50, 0x4b, 0x07, 0x08], // Spanned ZIP
      [0xfe, 0xed, 0xfa, 0xce], // Mach-O
      [0x7f, 0x45, 0x4c, 0x46], // ELF
    ];

    for (const sig of binarySignatures) {
      if (header.length >= sig.length) {
        const match = sig.every((byte, i) => header[i] === byte);
        if (match) return false;
      }
    }

    // Check for null bytes (common in binaries)
    if (buffer.includes(0)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Try using ripgrep (rg) if available
 */
async function tryRipgrep(
  pattern: string,
  searchPath: string,
  caseInsensitive: boolean,
  maxResults: number
): Promise<{ matches: GrepResult["matches"]; truncated: boolean } | null> {
  return new Promise((resolve) => {
    const args = ["--json", "--no-heading", "--line-number"];

    if (caseInsensitive) {
      args.push("-i");
    }

    args.push(pattern);
    args.push(searchPath);

    const child = spawn("rg", args, { shell: true });

    let output = "";
    const matches: GrepResult["matches"] = [];

    const timeout = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 10000);

    child.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    child.on("error", () => {
      clearTimeout(timeout);
      resolve(null); // rg not available
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0 || !output) {
        resolve(null);
        return;
      }

      try {
        const lines = output.split("\n").filter(Boolean);
        for (const line of lines) {
          if (matches.length >= maxResults) break;

          try {
            const result = JSON.parse(line);
            if (result.type === "match") {
              const filePath = result.data.path.text;
              const lineNumber = result.data.line_number;
              const lineText = result.data.lines.text?.trim() || "";

              matches.push({
                path: filePath,
                line: lineNumber,
                char: result.data.submatches?.[0]?.start + 1 || 0,
                content: lineText.slice(0, MAX_GREP_CONTENT_WIDTH),
                lineNumber: lineNumber,
              });
            }
          } catch {
            // Skip invalid JSON
          }
        }

        resolve({
          matches,
          truncated: lines.length > maxResults,
        });
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Search files using native Node.js (fallback)
 */
async function searchWithNode(
  pattern: string,
  searchPath: string,
  recursive: boolean,
  caseInsensitive: boolean,
  includeHidden: boolean,
  maxResults: number,
  literalText: boolean
): Promise<{ matches: GrepResult["matches"]; truncated: boolean }> {
  const matches: GrepResult["matches"] = [];

  // Prepare regex
  let searchPattern = literalText ? escapeRegexPattern(pattern) : pattern;
  const flags = caseInsensitive ? "gi" : "g";
  const regex = getCachedRegex(searchPattern, flags);

  if (!regex) {
    return { matches, truncated: false };
  }

  // Walk directory recursively
  async function walkDirectory(dirPath: string, depth = 0) {
    if (matches.length >= maxResults) return;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (matches.length >= maxResults) break;

        const fullPath = join(dirPath, entry.name);

        // Skip hidden files/dirs if not included
        if (!includeHidden && entry.name.startsWith(".")) {
          continue;
        }

        // Skip common ignore directories
        if (entry.isDirectory() && ["node_modules", ".git", "dist", "build"].includes(entry.name)) {
          continue;
        }

        if (entry.isDirectory() && recursive) {
          await walkDirectory(fullPath, depth + 1);
        } else if (entry.isFile()) {
          // Search in file
          if (!(await isTextFile(fullPath))) continue;

          try {
            const content = await readFile(fullPath, "utf-8");
            const lines = content.split("\n");

            for (let i = 0; i < lines.length; i++) {
              if (matches.length >= maxResults) break;

              regex.lastIndex = 0; // Reset regex state
              const match = regex.exec(lines[i]);

              if (match) {
                matches.push({
                  path: fullPath,
                  line: i + 1,
                  char: match.index + 1,
                  content: lines[i].trim().slice(0, MAX_GREP_CONTENT_WIDTH),
                  lineNumber: i + 1,
                });
              }
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    } catch {
      // Skip directories that can't be accessed
    }
  }

  await walkDirectory(searchPath);

  return {
    matches,
    truncated: matches.length >= maxResults,
  };
}

/**
 * Search for a pattern in files using regex
 * @param input - Grep parameters as an object
 * @returns Matching lines or error
 */
export async function grep(input: GrepInput): Promise<GrepResult> {
  const {
    pattern,
    path: inputPath,
    recursive = true,
    case_insensitive = false,
    include_hidden = false,
    max_results = 100,
    literal_text = false,
    working_directory
  } = input;

  if (!pattern || pattern.trim() === "") {
    return {
      success: false,
      error: "Pattern is required for grep",
    };
  }

  const wd = working_directory || process.cwd?.() || "";
  const searchPath = resolvePath(inputPath || ".", wd);

  // Safety check
  if (!isSafePath(searchPath, wd)) {
    return {
      success: false,
      error: `Path ${inputPath || "."} is outside working directory`,
    };
  }

  // Check if path exists
  try {
    await stat(searchPath);
  } catch {
    return {
      success: false,
      error: `Path does not exist: ${inputPath || "."}`,
    };
  }

  // Try ripgrep first (faster), fall back to Node.js implementation
  let result = await tryRipgrep(pattern, searchPath, case_insensitive, max_results);

  if (!result) {
    // Ripgrep not available or failed, use Node.js fallback
    result = await searchWithNode(
      pattern,
      searchPath,
      recursive,
      case_insensitive,
      include_hidden,
      max_results,
      literal_text
    );
  }

  if (result.matches.length === 0) {
    return {
      success: true,
      matches: [],
      path: String(searchPath),
      count: 0,
      truncated: false,
    };
  }

  return {
    success: true,
    matches: result.matches,
    path: String(searchPath),
    count: result.matches.length,
    truncated: result.truncated,
  };
}

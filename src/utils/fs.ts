/**
 * File System Helpers
 * Ported from src/codin/utils/fs_helpers.py
 */

import { resolve, dirname, join, relative, isAbsolute, basename } from "node:path";
import { mkdir } from "node:fs/promises";
import { cwd } from "node:process";

/**
 * Resolve a path relative to a working directory
 */
export function resolvePath(path: string, workingDirectory: string = cwd()): string {
  const pathObj = resolve(path);

  // If absolute, use as-is
  if (isAbsolute(pathObj)) {
    return pathObj;
  }

  // Otherwise resolve relative to working directory
  return join(workingDirectory, pathObj);
}

/**
 * Ensure parent directory of a path exists
 */
export async function ensureParentDir(path: string): Promise<void> {
  const parent = dirname(path);
  await mkdir(parent, { recursive: true });
}

/**
 * Check if a path is within working directory (safety check)
 */
export function isSafePath(path: string, workingDirectory: string = cwd()): boolean {
  try {
    const resolved = resolve(path);
    const workingResolved = resolve(workingDirectory);
    const rel = relative(workingResolved, resolved);
    // Safe if relative path doesn't start with ..
    return !rel.startsWith("..");
  } catch {
    return false;
  }
}

/**
 * Normalize a path for consistent handling
 */
export function normalizePath(path: string): string {
  return resolve(path).normalize();
}

/**
 * Get file extension from path
 */
export function getExtension(path: string): string {
  const base = basename(path);
  const idx = base.lastIndexOf(".");
  return idx === -1 ? "" : base.slice(idx);
}

// Re-export commonly used path functions
export { resolve, dirname, join, relative, isAbsolute, basename, cwd };

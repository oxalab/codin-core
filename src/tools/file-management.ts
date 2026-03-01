/**
 * File Management Tools
 *
 * Copy, move, delete files and create directories.
 * Matches the updated schema with object parameters.
 */

import { copyFile as fsCopyFile, rename, rm, mkdir } from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { resolve, dirname } from "node:path";
import { createGzip, createBrotliCompress, createDeflate } from "node:zlib";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";

import { resolvePath, isSafePath } from "../utils/fs.js";
import type { ToolResult } from "../types/tools.js";

/**
 * Result interface for copy_file
 */
interface CopyFileResult extends ToolResult {
  source?: string;
  destination?: string;
  copied?: boolean;
  error?: string;
}

/**
 * Input parameters for copy_file (matches schema)
 */
export interface CopyFileInput {
  source: string;
  destination: string;
  recursive?: boolean;
  overwrite?: boolean;
  working_directory?: string;
}

/**
 * Copy a file or directory
 * @param input - Copy file parameters as an object
 * @returns Copy result or error
 */
export async function copyFile(input: CopyFileInput): Promise<CopyFileResult> {
  const { source, destination, recursive = true, overwrite = false, working_directory } = input;
  try {
    const wd = working_directory || process.cwd?.() || "";
    const sourcePath = resolvePath(source, wd);
    const destPath = resolvePath(destination, wd);

    // Safety checks
    if (!isSafePath(sourcePath, wd)) {
      return {
        success: false,
        error: `Source ${source} is outside working directory`,
        source,
        destination,
      };
    }

    if (!isSafePath(destPath, wd)) {
      return {
        success: false,
        error: `Destination ${destination} is outside working directory`,
        source,
        destination,
      };
    }

    // Check if destination exists and overwrite is false
    const { stat } = await import("node:fs/promises");
    let destExists = false;
    try {
      await stat(destPath);
      destExists = true;
    } catch {
      destExists = false;
    }

    if (destExists && !overwrite) {
      return {
        success: false,
        error: `Destination already exists and overwrite is false: ${destination}`,
        source,
        destination,
      };
    }

    // Check if source is a directory
    const sourceStats = await stat(sourcePath);
    const isDirectory = sourceStats.isDirectory();

    if (isDirectory) {
      if (!recursive) {
        return {
          success: false,
          error: `Source is a directory but recursive is false: ${source}`,
          source,
          destination,
        };
      }

      // For directory copy, use system command (tar on Unix, robocopy on Windows)
      const platform = process.platform;
      if (platform === "win32") {
        // Use robocopy on Windows
        await new Promise<void>((resolve, reject) => {
          const child = spawn(
            "robocopy",
            [String(sourcePath), String(destPath), "/e", "/is"],
            {
              cwd: wd,
              windowsHide: true,
            }
          );

          child.on("error", (error: Error) => {
            reject(new Error(`robocopy error: ${error.message}`));
          });

          child.on("close", (code: number | null) => {
            if (code === 0 || code === 1) {
              // 0 = success, 1 = no files to copy (OK)
              resolve();
            } else {
              reject(new Error(`robocopy exited with code ${code}`));
            }
          });
        });
      } else {
        // Use tar on Unix
        await new Promise<void>((resolve, reject) => {
          const child = spawn("tar", ["-cf", "-", String(sourcePath)], {
            cwd: wd,
            windowsHide: true,
            stdio: ["ignore", "pipe", "ignore"],
          });

          const extract = spawn("tar", ["-xf", "-", "-C", String(destPath)], {
            cwd: wd,
            windowsHide: true,
            stdio: ["pipe", "ignore", "ignore"],
          });

          child.stdio[1]?.pipe(extract.stdio[0]);

          let hasError = false;

          extract.on("error", (error: Error) => {
            hasError = true;
            reject(new Error(`tar extract error: ${error.message}`));
          });

          child.on("error", (error: Error) => {
            hasError = true;
            reject(new Error(`tar create error: ${error.message}`));
          });

          extract.on("close", (code: number | null) => {
            if (!hasError) {
              if (code === 0) {
                resolve();
              } else {
                reject(new Error(`tar extract exited with code ${code}`));
              }
            }
          });

          child.on("close", (code: number | null) => {
            if (!hasError) {
              if (code !== 0) {
                hasError = true;
                reject(new Error(`tar create exited with code ${code}`));
              }
            }
          });
        });
      }
    } else {
      // File copy
      await fsCopyFile(sourcePath, destPath);
    }

    return {
      success: true,
      source,
      destination,
      copied: true,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "EACCES" || err.code === "EPERM") {
      return {
        success: false,
        error: `Permission denied: ${err.message}`,
        source,
        destination,
      };
    }

    return {
      success: false,
      error: `Error copying file: ${(error as Error).message}`,
      source,
      destination,
    };
  }
}

/**
 * Result interface for move_file
 */
interface MoveFileResult extends ToolResult {
  source?: string;
  destination?: string;
  moved?: boolean;
  error?: string;
}

/**
 * Input parameters for move_file (matches schema)
 */
export interface MoveFileInput {
  source: string;
  destination: string;
  overwrite?: boolean;
  working_directory?: string;
}

/**
 * Move a file or directory
 * @param input - Move file parameters as an object
 * @returns Move result or error
 */
export async function moveFile(input: MoveFileInput): Promise<MoveFileResult> {
  const { source, destination, overwrite = false, working_directory } = input;
  try {
    const wd = working_directory || process.cwd?.() || "";
    const sourcePath = resolvePath(source, wd);
    const destPath = resolvePath(destination, wd);

    // Safety checks
    if (!isSafePath(sourcePath, wd)) {
      return {
        success: false,
        error: `Source ${source} is outside working directory`,
        source,
        destination,
      };
    }

    if (!isSafePath(destPath, wd)) {
      return {
        success: false,
        error: `Destination ${destination} is outside working directory`,
        source,
        destination,
      };
    }

    // Check if destination exists and overwrite is false
    const { stat } = await import("node:fs/promises");
    let destExists = false;
    try {
      await stat(destPath);
      destExists = true;
    } catch {
      destExists = false;
    }

    if (destExists && !overwrite) {
      return {
        success: false,
        error: `Destination already exists and overwrite is false: ${destination}`,
        source,
        destination,
      };
    }

    // Move file/directory
    await rename(sourcePath, destPath);

    return {
      success: true,
      source,
      destination,
      moved: true,
    };
  } catch (error) {
    const err = error as NodeJS.ErrnoException;

    if (err.code === "EACCES" || err.code === "EPERM") {
      return {
        success: false,
        error: `Permission denied: ${err.message}`,
        source,
        destination,
      };
    }

    return {
      success: false,
      error: `Error moving file: ${(error as Error).message}`,
      source,
      destination,
    };
  }
}

/**
 * Result interface for delete_file
 */
interface DeleteFileResult extends ToolResult {
  path?: string;
  deleted?: boolean;
  error?: string;
}

/**
 * Input parameters for delete_file (matches schema)
 */
export interface DeleteFileInput {
  path: string;
  recursive?: boolean;
  force?: boolean;
  working_directory?: string;
}

/**
 * Delete a file or directory
 * @param input - Delete file parameters as an object
 * @returns Delete result or error
 */
export async function deleteFile(input: DeleteFileInput): Promise<DeleteFileResult> {
  const { path, recursive = true, force = false, working_directory } = input;
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

    // Check if exists
    const { stat } = await import("node:fs/promises");
    const stats = await stat(filePath);

    if (stats.isDirectory()) {
      if (!recursive) {
        return {
          success: false,
          error: `Path is a directory but recursive is false: ${path}`,
          path,
        };
      }

      // Recursive delete
      await rm(filePath, { recursive: true, force: true });
    } else {
      // File delete
      await rm(filePath);
    }

    return {
      success: true,
      path,
      deleted: true,
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
      error: `Error deleting file: ${(error as Error).message}`,
      path,
    };
  }
}

/**
 * Result interface for create_directory
 */
interface CreateDirectoryResult extends ToolResult {
  path?: string;
  created?: boolean;
  error?: string;
}

/**
 * Input parameters for create_directory (matches schema)
 */
export interface CreateDirectoryInput {
  path: string;
  parents?: boolean;
  exist_ok?: boolean;
  working_directory?: string;
}

/**
 * Create a directory
 * @param input - Create directory parameters as an object
 * @returns Create result or error
 */
export async function createDirectory(input: CreateDirectoryInput): Promise<CreateDirectoryResult> {
  const { path, parents = true, exist_ok = true, working_directory } = input;
  try {
    const wd = working_directory || process.cwd?.() || "";
    const dirPath = resolvePath(path, wd);

    // Safety check
    if (!isSafePath(dirPath, wd)) {
      return {
        success: false,
        error: `Path ${path} is outside working directory`,
        path,
      };
    }

    // Create directory
    await mkdir(dirPath, { recursive: parents });

    return {
      success: true,
      path,
      created: true,
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

    if (err.code === "EEXIST") {
      if (exist_ok) {
        return {
          success: true,
          path,
          created: false,
        };
      }

      return {
        success: false,
        error: `Directory already exists: ${path}`,
        path,
      };
    }

    return {
      success: false,
      error: `Error creating directory: ${(error as Error).message}`,
      path,
    };
  }
}

/**
 * Result interface for compress
 */
interface CompressResult extends ToolResult {
  destination?: string;
  compressed?: boolean;
  size?: number;
  error?: string;
}

/**
 * Input parameters for compress (matches schema)
 */
export interface CompressInput {
  sources: string[];
  destination: string;
  format?: "zip" | "tar" | "tar.gz" | "tar.bz2" | "tgz";
  working_directory?: string;
}

/**
 * Compress files and directories into an archive
 * @param input - Compress parameters as an object
 * @returns Compress result or error
 */
export async function compress(input: CompressInput): Promise<CompressResult> {
  const { sources, destination, format = "zip", working_directory } = input;
  try {
    const wd = working_directory || process.cwd?.() || "";
    const destPath = resolvePath(destination, wd);

    // Safety check
    if (!isSafePath(destPath, wd)) {
      return {
        success: false,
        error: `Destination ${destination} is outside working directory`,
        destination,
      };
    }

    // Ensure parent directory exists
    const parentDir = dirname(destPath);
    await mkdir(parentDir, { recursive: true });

    // Determine format from extension if not specified
    const finalFormat = format || inferFormat(destination);

    // Use system tar/zip commands for compression
    const platform = process.platform;

    if (platform === "win32") {
      // On Windows, use PowerShell Compress-Archive for zip
      if (finalFormat === "zip") {
        await new Promise<void>((resolve, reject) => {
          const args = [
            "Compress-Archive",
            "-Path",
            sources.map((s) => resolvePath(s, wd)).join(","),
            "-DestinationPath",
            String(destPath),
          ];

          const child = spawn("powershell", ["-Command", args.join(" ")], {
            cwd: wd,
            windowsHide: true,
          });

          child.on("error", (error: Error) => {
            reject(new Error(`PowerShell error: ${error.message}`));
          });

          child.on("close", (code: number | null) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`PowerShell exited with code ${code}`));
            }
          });
        });
      } else {
        return {
          success: false,
          error: `Format ${finalFormat} not yet supported on Windows`,
          destination,
        };
      }
    } else {
      // On Unix, use tar
      const tarArgs: string[] = ["-cf", String(destPath)];

      // Add compression flag
      if (finalFormat === "tar.gz" || finalFormat === "tgz") {
        tarArgs.push("-z");
      } else if (finalFormat === "tar.bz2") {
        tarArgs.push("-j");
      }

      // Add sources
      for (const source of sources) {
        const sourcePath = resolvePath(source, wd);
        if (!isSafePath(sourcePath, wd)) {
          return {
            success: false,
            error: `Source ${source} is outside working directory`,
            destination,
          };
        }
        tarArgs.push(String(sourcePath));
      }

      await new Promise<void>((resolve, reject) => {
        const child = spawn("tar", tarArgs, {
          cwd: wd,
          windowsHide: true,
        });

        child.on("error", (error: Error) => {
          reject(new Error(`tar error: ${error.message}`));
        });

        child.on("close", (code: number | null) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`tar exited with code ${code}`));
          }
        });
      });
    }

    return {
      success: true,
      destination,
      compressed: true,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error compressing: ${(error as Error).message}`,
      destination,
    };
  }
}

/**
 * Result interface for extract
 */
interface ExtractResult extends ToolResult {
  source?: string;
  destination?: string;
  extracted?: boolean;
  error?: string;
}

/**
 * Input parameters for extract (matches schema)
 */
export interface ExtractInput {
  source: string;
  destination?: string;
  overwrite?: boolean;
  working_directory?: string;
}

/**
 * Extract an archive file
 * @param input - Extract parameters as an object
 * @returns Extract result or error
 */
export async function extract(input: ExtractInput): Promise<ExtractResult> {
  const { source, destination, overwrite = false, working_directory } = input;
  try {
    const wd = working_directory || process.cwd?.() || "";
    const sourcePath = resolvePath(source, wd);
    const destPath = resolvePath(destination || ".", wd);

    // Safety check
    if (!isSafePath(sourcePath, wd)) {
      return {
        success: false,
        error: `Source ${source} is outside working directory`,
        source,
        destination,
      };
    }

    if (!isSafePath(destPath, wd)) {
      return {
        success: false,
        error: `Destination ${destination || "."} is outside working directory`,
        source,
        destination,
      };
    }

    // Ensure destination directory exists
    await mkdir(destPath, { recursive: true });

    // Determine extract command based on file extension
    const ext = source.toLowerCase();
    const platform = process.platform;

    if (ext.endsWith(".zip")) {
      if (platform === "win32") {
        // Use PowerShell Expand-Archive
        await new Promise<void>((resolve, reject) => {
          const args = [
            "Expand-Archive",
            "-Path",
            String(sourcePath),
            "-DestinationPath",
            String(destPath),
            "-Force",
          ];

          const child = spawn("powershell", ["-Command", args.join(" ")], {
            cwd: wd,
            windowsHide: true,
          });

          child.on("error", (error: Error) => {
            reject(new Error(`PowerShell error: ${error.message}`));
          });

          child.on("close", (code: number | null) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`PowerShell exited with code ${code}`));
            }
          });
        });
      } else {
        // Use unzip on Unix
        await new Promise<void>((resolve, reject) => {
          const child = spawn("unzip", ["-o", String(sourcePath), "-d", String(destPath)], {
            cwd: wd,
            windowsHide: true,
          });

          child.on("error", (error: Error) => {
            reject(new Error(`unzip error: ${error.message}`));
          });

          child.on("close", (code: number | null) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`unzip exited with code ${code}`));
            }
          });
        });
      }
    } else if (ext.endsWith(".tar") || ext.endsWith(".tar.gz") || ext.endsWith(".tgz") || ext.endsWith(".tar.bz2")) {
      // Use tar
      const tarArgs: string[] = ["-xf", String(sourcePath), "-C", String(destPath)];

      await new Promise<void>((resolve, reject) => {
        const child = spawn("tar", tarArgs, {
          cwd: wd,
          windowsHide: true,
        });

        child.on("error", (error: Error) => {
          reject(new Error(`tar error: ${error.message}`));
        });

        child.on("close", (code: number | null) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`tar exited with code ${code}`));
          }
        });
      });
    } else {
      return {
        success: false,
        error: `Unsupported archive format: ${source}`,
        source,
        destination,
      };
    }

    return {
      success: true,
      source,
      destination,
      extracted: true,
    };
  } catch (error) {
    return {
      success: false,
      error: `Error extracting: ${(error as Error).message}`,
      source,
      destination,
    };
  }
}

/**
 * Infer archive format from file extension
 */
function inferFormat(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".tar.bz2")) return "tar.bz2";
  if (lower.endsWith(".tar")) return "tar";
  return "zip"; // default
}

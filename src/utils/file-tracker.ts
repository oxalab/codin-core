/**
 * File Read Tracker
 *
 * Tracks when files were last read to enable "read before edit" safety checks.
 * This prevents editing files that haven't been read first or were modified externally.
 */

import { stat } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * File read entry
 */
interface FileReadEntry {
  path: string;
  lastReadTime: number;
  lastKnownModTime?: number;
}

/**
 * File read tracker - singleton per session
 */
class FileReadTracker {
  private reads = new Map<string, FileReadEntry>();

  /**
   * Record that a file was read
   */
  recordRead(filePath: string, modTime?: number): void {
    const key = resolve(filePath);
    const entry: FileReadEntry = {
      path: filePath,
      lastReadTime: Date.now(),
      lastKnownModTime: modTime,
    };
    this.reads.set(key, entry);
  }

  /**
   * Get the last read time for a file
   */
  getLastReadTime(filePath: string): number {
    const key = resolve(filePath);
    return this.reads.get(key)?.lastReadTime ?? 0;
  }

  /**
   * Get the last known modification time for a file
   */
  getLastKnownModTime(filePath: string): number | undefined {
    const key = resolve(filePath);
    return this.reads.get(key)?.lastKnownModTime;
  }

  /**
   * Check if a file was read before
   */
  wasRead(filePath: string): boolean {
    return this.getLastReadTime(filePath) > 0;
  }

  /**
   * Check if a file was modified since last read
   */
  async wasModifiedSinceRead(filePath: string): Promise<boolean> {
    const lastRead = this.getLastReadTime(filePath);
    if (lastRead === 0) {
      return false; // Never read, so can't be modified since
    }

    try {
      const stats = await stat(filePath);
      const modTime = Math.floor(stats.mtime.getTime() / 1000); // Convert to seconds for comparison
      const lastReadSeconds = Math.floor(lastRead / 1000);

      return modTime > lastReadSeconds;
    } catch {
      return false;
    }
  }

  /**
   * Clear all read tracking (e.g., for new session)
   */
  clear(): void {
    this.reads.clear();
  }

  /**
   * Remove a file from tracking
   */
  forget(filePath: string): void {
    const key = resolve(filePath);
    this.reads.delete(key);
  }

  /**
   * Get all tracked files
   */
  getAllTrackedFiles(): string[] {
    return Array.from(this.reads.keys());
  }
}

/**
 * Global file tracker instance
 */
export const fileTracker = new FileReadTracker();

/**
 * Record a file read operation
 */
export function recordFileRead(filePath: string, modTime?: number): void {
  fileTracker.recordRead(filePath, modTime);
}

/**
 * Check if a file was read before editing
 */
export function wasFileRead(filePath: string): boolean {
  return fileTracker.wasRead(filePath);
}

/**
 * Check if a file was modified since last read
 */
export async function wasFileModifiedSinceRead(filePath: string): Promise<boolean> {
  return fileTracker.wasModifiedSinceRead(filePath);
}

/**
 * Clear file tracking
 */
export function clearFileTracking(): void {
  fileTracker.clear();
}

/**
 * Change Preview
 * Ported from src/codin/agent/change_preview.py
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { resolvePath } from "../utils/fs.js";

/**
 * Change Preview Manager class
 * Manages diff previews for file changes
 */
export class ChangePreviewManager {
  private workingDirectory: string;

  constructor(workingDirectory: string = "") {
    this.workingDirectory = workingDirectory || process.cwd?.() || "";
  }

  /**
   * Generate a unified diff preview for a file change
   */
  async generateDiffPreview(
    path: string,
    oldContent: string,
    newContent: string
  ): Promise<string> {
    // Generate unified diff format
    const oldLines = oldContent.split("\n");
    const newLines = newContent.split("\n");

    let diff = `--- a/${path}\n`;
    diff += `+++ b/${path}\n`;

    // Find common prefix and suffix
    let startIndex = 0;
    while (
      startIndex < oldLines.length &&
      startIndex < newLines.length &&
      oldLines[startIndex] === newLines[startIndex]
    ) {
      startIndex++;
    }

    let oldEndIndex = oldLines.length - 1;
    let newEndIndex = newLines.length - 1;

    while (
      oldEndIndex >= startIndex &&
      newEndIndex >= startIndex &&
      oldLines[oldEndIndex] === newLines[newEndIndex]
    ) {
      oldEndIndex--;
      newEndIndex--;
    }

    // Generate hunks
    if (startIndex <= oldEndIndex || startIndex <= newEndIndex) {
      const oldCount = oldEndIndex - startIndex + 1;
      const newCount = newEndIndex - startIndex + 1;
      diff += `@@ -${startIndex + 1},${oldCount} +${startIndex + 1},${newCount} @@\n`;

      // Old lines (deletions)
      for (let i = startIndex; i <= oldEndIndex; i++) {
        diff += `-${oldLines[i]}\n`;
      }

      // New lines (additions)
      for (let i = startIndex; i <= newEndIndex; i++) {
        diff += `+${newLines[i]}\n`;
      }
    }

    return diff;
  }

  /**
   * Preview changes for a file edit
   */
  async previewEdit(
    path: string,
    oldString: string,
    newString: string
  ): Promise<string> {
    const filePath = resolvePath(path, this.workingDirectory);

    let currentContent = "";
    try {
      currentContent = await readFile(filePath, "utf-8");
    } catch {
      // File doesn't exist yet
      currentContent = "";
    }

    const newContent = currentContent.replace(oldString, newString);
    return await this.generateDiffPreview(path, currentContent, newContent);
  }

  /**
   * Preview changes for a write operation
   */
  async previewWrite(path: string, content: string): Promise<string> {
    const filePath = resolvePath(path, this.workingDirectory);

    let currentContent = "";
    try {
      currentContent = await readFile(filePath, "utf-8");
    } catch {
      // File doesn't exist yet
      currentContent = "";
    }

    return await this.generateDiffPreview(path, currentContent, content);
  }

  /**
   * Compute similarity score between two strings
   */
  computeSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;

    const len1 = str1.length;
    const len2 = str2.length;

    if (len1 === 0) return len2 === 0 ? 1.0 : 0.0;
    if (len2 === 0) return 0.0;

    // Simple Levenshtein distance
    const matrix: number[][] = [];
    for (let i = 0; i <= len2; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len1; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len2; i++) {
      for (let j = 1; j <= len1; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i][j - 1] + 1 // deletion
          );
        }
      }
    }

    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return 1.0 - distance / maxLen;
  }
}

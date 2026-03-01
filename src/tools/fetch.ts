/**
 * Fetch Tool
 *
 * Fetches raw content from a URL without processing.
 * Similar to curl but more LLM-friendly.
 *
 * Features:
 * - Returns raw text or base64 for binary content
 * - UTF-8 validation
 * - No API required
 *
 * Completely FREE - no API costs.
 */

import type { ToolResult } from "../types/tools.js";

/**
 * Result interface for fetch
 */
interface FetchResult extends ToolResult {
  content?: string;
  url?: string;
  mimeType?: string;
  size?: number;
  encoding?: string;
  error?: string;
}

/**
 * Input parameters for fetch
 */
export interface FetchInput {
  url: string;
  timeout?: number;
  max_size?: number;
}

/**
 * Maximum response size (10MB default)
 */
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024;

/**
 * Check if content is likely text
 */
function isTextMimeType(mimeType: string): boolean {
  const textTypes = [
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/x-javascript",
    "application/atom+xml",
    "application/rss+xml",
    "application/xhtml+xml",
    "application/sql",
  ];
  return textTypes.some(type => mimeType.toLowerCase().startsWith(type));
}

/**
 * Validate UTF-8 content
 */
function isValidUTF8(buffer: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert buffer to base64
 */
function toBase64(buffer: Uint8Array): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return base64;
}

/**
 * Fetch raw content from URL
 * @param input - Fetch parameters
 * @returns Fetched content or error
 */
export async function fetchUrl(input: FetchInput): Promise<FetchResult> {
  const { url, timeout = 30000, max_size = DEFAULT_MAX_SIZE } = input;

  if (!url || url.trim() === "") {
    return {
      success: false,
      error: "URL is required",
    };
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return {
      success: false,
      error: "Invalid URL format",
    };
  }

  // Only allow HTTP/HTTPS
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return {
      success: false,
      error: "Only HTTP and HTTPS URLs are supported",
    };
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "*/*",
      },
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    });

    if (!response.ok) {
      return {
        success: false,
        error: `HTTP ${response.status}: ${response.statusText}`,
        url,
      };
    }

    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const buffer = new Uint8Array(await response.arrayBuffer());
    const size = buffer.length;

    // Check size limit
    if (size > max_size) {
      return {
        success: false,
        error: `Response too large (${(size / 1024 / 1024).toFixed(2)}MB). Maximum size is ${(max_size / 1024 / 1024).toFixed(2)}MB.`,
        url,
      };
    }

    // Return content based on type
    if (isTextMimeType(contentType) || isValidUTF8(buffer)) {
      const text = new TextDecoder().decode(buffer);
      return {
        success: true,
        content: text,
        url,
        mimeType: contentType,
        size,
        encoding: "utf-8",
      };
    }

    // Binary content - return as base64
    const base64 = toBase64(buffer);
    return {
      success: true,
      content: base64,
      url,
      mimeType: contentType,
      size,
      encoding: "base64",
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return {
        success: false,
        error: `Request timed out after ${timeout}ms`,
        url,
      };
    }

    return {
      success: false,
      error: `Fetch failed: ${(error as Error).message}`,
      url,
    };
  }
}

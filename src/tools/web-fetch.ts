/**
 * Web Fetch Tool
 *
 * Fetches content from a web URL and converts to markdown.
 *
 * Features:
 * - Fetches HTML and converts to readable markdown
 * - Handles large pages (>50KB) by saving to temp file
 * - UTF-8 validation
 * - No API required
 *
 * Completely FREE - no API costs.
 */

import type { ToolResult } from "../types/tools.js";

/**
 * Result interface for web_fetch
 */
interface WebFetchResult extends ToolResult {
  content?: string;
  url?: string;
  mimeType?: string;
  size?: number;
  truncated?: boolean;
  tempFile?: string;
  error?: string;
}

/**
 * Input parameters for web_fetch
 */
export interface WebFetchInput {
  url: string;
  timeout?: number;
}

/**
 * Maximum response size before truncating (5MB)
 */
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024;

/**
 * Threshold for saving to temp file (50KB)
 */
const TEMP_FILE_THRESHOLD = 50 * 1024;

/**
 * Convert HTML to markdown (simplified)
 */
function htmlToMarkdown(html: string): string {
  let markdown = html;

  // Remove script and style tags
  markdown = markdown.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  markdown = markdown.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Headers
  markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n\n");
  markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n\n");
  markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n\n");
  markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n\n");
  markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n\n");
  markdown = markdown.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n\n");

  // Bold and italic
  markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");
  markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");

  // Code blocks
  markdown = markdown.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, "```\n$1\n```\n\n");
  markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, "`$1`");

  // Links
  markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "[$2]($1)");

  // Images
  markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, "![$2]($1)");
  markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*>/gi, "![]($1)");

  // Line breaks and paragraphs
  markdown = markdown.replace(/<br\s*\/?>/gi, "\n");
  markdown = markdown.replace(/<\/p>/gi, "\n\n");
  markdown = markdown.replace(/<p[^>]*>/gi, "");
  markdown = markdown.replace(/<\/div>/gi, "\n\n");
  markdown = markdown.replace(/<div[^>]*>/gi, "");

  // Lists
  markdown = markdown.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");
  markdown = markdown.replace(/<\/ul>/gi, "\n");
  markdown = markdown.replace(/<\/ol>/gi, "\n");
  markdown = markdown.replace(/<[uo]l[^>]*>/gi, "");

  // Blockquotes
  markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, (match, content) => {
    const lines = content.trim().split("\n");
    return lines.map(line => `> ${line}`).join("\n") + "\n\n";
  });

  // Tables (simplified - just remove tags)
  markdown = markdown.replace(/<\/?table[^>]*>/gi, "\n");
  markdown = markdown.replace(/<\/?tr[^>]*>/gi, "\n");
  markdown = markdown.replace(/<\/?t[hd][^>]*>/gi, " | ");

  // Remove remaining HTML tags
  markdown = markdown.replace(/<[^>]+>/g, "");

  // Clean up whitespace
  markdown = markdown.replace(/\n{3,}/g, "\n\n");
  markdown = markdown.trim();

  // Decode HTML entities
  const textArea = document?.createElement?.("textarea");
  if (textArea) {
    textArea.innerHTML = markdown;
    markdown = textArea.value;
  } else {
    // Fallback for Node.js environment
    markdown = markdown
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  }

  return markdown;
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
 * Fetch web content and convert to markdown
 * @param input - Fetch parameters
 * @returns Fetched content or error
 */
export async function webFetch(input: WebFetchInput): Promise<WebFetchResult> {
  const { url, timeout = 30000 } = input;

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
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
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

    const contentType = response.headers.get("content-type") || "text/html";
    const buffer = new Uint8Array(await response.arrayBuffer());

    // Validate UTF-8
    if (!isValidUTF8(buffer)) {
      return {
        success: false,
        error: "Response is not valid UTF-8",
        url,
      };
    }

    const html = new TextDecoder().decode(buffer);
    const size = buffer.length;

    // Check for truncation
    if (size > MAX_RESPONSE_SIZE) {
      return {
        success: false,
        error: `Response too large (${(size / 1024 / 1024).toFixed(2)}MB). Maximum size is ${MAX_RESPONSE_SIZE / 1024 / 1024}MB.`,
        url,
      };
    }

    // Check for temp file save (large content)
    if (size > TEMP_FILE_THRESHOLD) {
      const { writeFile } = await import("node:fs/promises");
      const { randomUUID } = await import("node:crypto");
      const { join } = await import("node:path");
      const { tmpdir } = await import("node:os");

      const tempPath = join(tmpdir(), `webfetch-${randomUUID()}.html`);
      await writeFile(tempPath, html, "utf-8");

      // Return truncated preview
      const preview = html.slice(0, 10000);
      const markdown = htmlToMarkdown(preview);

      return {
        success: true,
        content: markdown + `\n\n[Content truncated - saved to temp file: ${tempPath}]`,
        url,
        mimeType: contentType,
        size,
        truncated: true,
        tempFile: tempPath,
      };
    }

    // Convert to markdown
    const markdown = htmlToMarkdown(html);

    return {
      success: true,
      content: markdown,
      url,
      mimeType: contentType,
      size,
      truncated: false,
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

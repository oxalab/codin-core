/**
 * Web Search Tool
 *
 * Searches the web using DuckDuckGo Lite.
 *
 * Features:
 * - No API key required (scrapes DuckDuckGo Lite)
 * - Returns title, URL, and snippet for each result
 * - Random delays to avoid blocking
 * - Rotating user agents
 *
 * Completely FREE - no API costs.
 */

import type { ToolResult } from "../types/tools.js";

/**
 * Search result from DuckDuckGo
 */
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

/**
 * Result interface for web_search
 */
interface WebSearchResult extends ToolResult {
  results?: SearchResult[];
  count?: number;
  query?: string;
  error?: string;
}

/**
 * Input parameters for web_search
 */
export interface WebSearchInput {
  query: string;
  max_results?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

/**
 * Random user agents to avoid blocking
 */
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
];

/**
 * Accept-Language headers
 */
const ACCEPT_LANGUAGES = [
  "en-US,en;q=0.9",
  "en-GB,en;q=0.9,en-US;q=0.8",
  "en-US,en;q=0.5",
];

/**
 * Last search time for rate limiting
 */
let lastSearchTime = 0;

/**
 * Get a random user agent
 */
function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Get a random accept language
 */
function getRandomAcceptLanguage(): string {
  return ACCEPT_LANGUAGES[Math.floor(Math.random() * ACCEPT_LANGUAGES.length)];
}

/**
 * Clean DuckDuckGo redirect URLs
 */
function cleanDuckDuckGoURL(url: string): string {
  if (url.includes("//duckduckgo.com/l/?uddg=")) {
    const match = url.match(/uddg=([^&]+)/);
    if (match) {
      try {
        return decodeURIComponent(match[1]);
      } catch {
        return url;
      }
    }
  }
  return url;
}

/**
 * Strip HTML tags from text
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Add delay to avoid rate limiting
 */
async function rateLimitDelay(): Promise<void> {
  const now = Date.now();
  const minGap = 500 + Math.random() * 1500; // 500-2000ms
  const elapsed = now - lastSearchTime;

  if (elapsed < minGap) {
    await new Promise(resolve => setTimeout(resolve, minGap - elapsed));
  }

  lastSearchTime = Date.now();
}

/**
 * Parse DuckDuckGo Lite HTML response
 */
function parseDuckDuckGoHTML(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo Lite uses simple HTML structure
  // Results are typically in <a> tags with class "result-link"
  const linkRegex = /<a[^>]*class="result-link"[^>]*>(.*?)<\/a>/gi;
  const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>(.*?)<\/td>/gis;

  const links: Array<{ text: string; url: string }> = [];

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const hrefMatch = match[0].match(/href="([^"]+)"/);
    if (hrefMatch) {
      links.push({
        text: stripHtml(match[1]),
        url: cleanDuckDuckGoURL(hrefMatch[1]),
      });
    }
  }

  // Extract snippets
  let snippetMatch;
  let snippetIndex = 0;
  while ((snippetMatch = snippetRegex.exec(html)) !== null) {
    if (snippetIndex < links.length) {
      links[snippetIndex].text = stripHtml(snippetMatch[1]);
      snippetIndex++;
    }
  }

  // Format results
  for (let i = 0; i < Math.min(links.length, maxResults); i++) {
    const link = links[i];
    if (link.url && link.url.startsWith("http")) {
      results.push({
        title: link.text || "Untitled",
        url: link.url,
        snippet: link.text || "",
        position: i + 1,
      });
    }
  }

  return results;
}

/**
 * Search the web using DuckDuckGo Lite
 * @param input - Search parameters
 * @returns Search results or error
 */
export async function webSearch(input: WebSearchInput): Promise<WebSearchResult> {
  const {
    query,
    max_results = 10,
    allowed_domains,
    blocked_domains,
  } = input;

  if (!query || query.trim() === "") {
    return {
      success: false,
      error: "Query is required for web search",
    };
  }

  if (max_results < 1 || max_results > 20) {
    return {
      success: false,
      error: "max_results must be between 1 and 20",
    };
  }

  // Rate limiting
  await rateLimitDelay();

  try {
    const searchURL = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;

    const response = await fetch(searchURL, {
      headers: {
        "User-Agent": getRandomUserAgent(),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": getRandomAcceptLanguage(),
        "Accept-Encoding": "identity",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Cache-Control": "max-age=0",
      },
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });

    if (!response.ok) {
      return {
        success: false,
        error: `Search failed with status: ${response.status}`,
      };
    }

    const html = await response.text();
    let results = parseDuckDuckGoHTML(html, max_results);

    // Filter by allowed/blocked domains
    if (allowed_domains?.length || blocked_domains?.length) {
      results = results.filter(result => {
        const urlDomain = new URL(result.url).hostname;

        // Check blocked domains
        if (blocked_domains?.some(domain => urlDomain.includes(domain))) {
          return false;
        }

        // Check allowed domains
        if (allowed_domains?.length && !allowed_domains.some(domain => urlDomain.includes(domain))) {
          return false;
        }

        return true;
      });
    }

    return {
      success: true,
      results,
      count: results.length,
      query,
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return {
        success: false,
        error: "Search timed out. Try again.",
      };
    }

    return {
      success: false,
      error: `Search failed: ${(error as Error).message}`,
    };
  }
}

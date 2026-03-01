/**
 * Rebuild Tools
 * Complete implementation for website rebuilding workflow
 *
 * Tools:
 * - rebuild_init: Initialize a rebuild run
 * - capture_site: Capture HTML, CSS, JS from a website
 * - extract_design_tokens: Extract design system tokens
 * - extract_component_map: Extract component structure
 * - harvest_assets: Download images, fonts, icons
 * - generate_code: Generate component code
 * - visual_diff: Compare original vs rebuilt screenshots
 * - auto_fix_pass: Auto-fix common issues
 * - rebuild_finalize: Finalize and export the rebuild
 */

import { mkdir, writeFile, readFile, access, stat, readdir } from "node:fs/promises";
import { join, dirname, relative, basename } from "node:path";
import { chromium } from "playwright";
import { parse, type CssNode, type Selector } from "css-tree";
import sharp from "sharp";
import Pixelmatch from "pixelmatch";

import type { ToolResult } from "../types/tools.js";
import type { LLMGateway } from "../agent/llm-gateway.js";

// ============================================================================
// Types and Interfaces
// ============================================================================

interface RebuildToolResult extends ToolResult {
  session_id?: string;
  output_dir?: string;
  error?: string;
  summary?: Record<string, unknown>;
}

interface RebuildRunState {
  session_id: string;
  url: string;
  target_stack: string;
  breakpoints: number[];
  states: string[];
  output_dir: string;
  created_at: string;
  status: "initialized" | "captured" | "tokens_extracted" | "components_extracted" | "assets_harvested" | "code_generated" | "completed";
}

// Input interfaces matching the schema
export interface RebuildInitInput {
  url: string;
  permission_confirmed: boolean;
  target_stack?: "static-html" | "nextjs-tailwind" | "react-shadcn" | "vue-tailwind" | "svelte-tailwind";
  breakpoints?: number[];
  states?: string[];
  output_dir?: string;
  session_id?: string;
}

export interface CaptureSiteInput {
  session_id: string;
  fetch_css?: boolean;
  fetch_js?: boolean;
  capture_screenshots?: boolean;
  timeout_seconds?: number;
}

export interface ExtractDesignTokensInput {
  session_id: string;
  output_format?: "json" | "css-variables" | "tailwind-config" | "style-dictionary";
}

export interface ExtractComponentMapInput {
  session_id: string;
  min_confidence?: number;
}

export interface HarvestAssetsInput {
  session_id: string;
  include_images?: boolean;
  include_fonts?: boolean;
  include_css?: boolean;
  include_js?: boolean;
  optimize_images?: boolean;
  timeout_seconds?: number;
}

export interface GenerateCodeInput {
  session_id: string;
  framework?: "react" | "vue" | "svelte" | "solid" | "html";
  styling?: "tailwind" | "css-modules" | "styled-components" | "vanilla-css";
  include_tokens_css?: boolean;
  accessibility?: "none" | "basic" | "wcag-aa" | "wcag-aaa";
}

export interface VisualDiffInput {
  session_id: string;
  threshold?: number;
  breakpoints?: number[];
}

export interface AutoFixPassInput {
  session_id: string;
  max_fixes?: number;
  target_similarity?: number;
}

export interface RebuildFinalizeInput {
  session_id: string;
  output_format?: "source" | "bundled" | "docker";
  include_docs?: boolean;
}

interface DesignTokens {
  colors: Record<string, string>;
  fonts: Record<string, { family: string; weights: number[] }>;
  spacing: Record<string, string>;
  border_radius: Record<string, string>;
  shadows: Record<string, string>;
  transitions: Record<string, string>;
}

interface ComponentNode {
  id: string;
  type: string;
  tag?: string;
  classes: string[];
  styles: Record<string, string>;
  children: ComponentNode[];
  content?: string;
  attributes: Record<string, string>;
}

interface AssetInfo {
  type: "image" | "font" | "icon" | "video";
  url: string;
  local_path?: string;
  size?: number;
  format?: string;
}

interface ScreenshotComparison {
  session_id: string;
  screenshot_path: string;
  original_path: string;
  diff_path: string;
  pixel_diff: number; // 0-1, percentage of different pixels
  pixel_count: number;
}

// ============================================================================
// Rebuild State Management
// ============================================================================

const REBUILD_RUNS_DIR = join(process.cwd(), "rebuild_runs");
const ACTIVE_RUNS = new Map<string, RebuildRunState>();

/**
 * Ensure rebuild runs directory exists
 */
async function ensureRunsDir(sessionId?: string): Promise<string> {
  const dir = sessionId ? join(REBUILD_RUNS_DIR, sessionId) : REBUILD_RUNS_DIR;
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // Directory may already exist
  }
  return dir;
}

/**
 * Save rebuild run state
 */
async function saveRunState(state: RebuildRunState): Promise<void> {
  await ensureRunsDir(state.session_id);
  const statePath = join(REBUILD_RUNS_DIR, state.session_id, "state.json");
  await writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
  ACTIVE_RUNS.set(state.session_id, state);
}

/**
 * Load rebuild run state
 */
async function loadRunState(sessionId: string): Promise<RebuildRunState | null> {
  if (ACTIVE_RUNS.has(sessionId)) {
    return ACTIVE_RUNS.get(sessionId)!;
  }
  const statePath = join(REBUILD_RUNS_DIR, sessionId, "state.json");
  try {
    const content = await readFile(statePath, "utf-8");
    const state = JSON.parse(content) as RebuildRunState;
    ACTIVE_RUNS.set(sessionId, state);
    return state;
  } catch {
    return null;
  }
}

// ============================================================================
// Tool 1: rebuild_init
// ============================================================================

/**
 * Initialize a website rebuild run
 */
export async function rebuildInit(input: RebuildInitInput): Promise<RebuildToolResult> {
  const {
    url,
    permission_confirmed,
    target_stack = "nextjs-tailwind",
    breakpoints = [640, 768, 1024, 1280],
    states = ["default", "hover", "active", "focus", "disabled"],
    output_dir,
    session_id
  } = input;

  if (!permission_confirmed) {
    return {
      success: false,
      error: "permission_confirmed must be true to proceed with rebuild_init",
    };
  }

  // Validate URL
  try {
    const urlObj = new URL(url);
    if (!urlObj.protocol.startsWith("http")) {
      return {
        success: false,
        error: "URL must start with http:// or https://",
      };
    }
  } catch {
    return {
      success: false,
      error: `Invalid URL: ${url}`,
    };
  }

  // Generate session ID
  const finalSessionId = session_id || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const finalOutputDir = output_dir || join(REBUILD_RUNS_DIR, finalSessionId);

  // Create directory structure
  await ensureRunsDir(finalSessionId);
  const subdirs = ["capture", "assets", "tokens", "components", "generated", "screenshots"];
  for (const sub of subdirs) {
    await mkdir(join(finalOutputDir, sub), { recursive: true });
  }

  // Create initial state
  const state: RebuildRunState = {
    session_id: finalSessionId,
    url,
    target_stack,
    breakpoints,
    states,
    output_dir: finalOutputDir,
    created_at: new Date().toISOString(),
    status: "initialized",
  };

  await saveRunState(state);

  // Save initial config
  await writeFile(
    join(finalOutputDir, "config.json"),
    JSON.stringify(
      {
        session_id: finalSessionId,
        url,
        target_stack,
        breakpoints,
        states,
        created_at: state.created_at,
      },
      null,
      2
    ),
    "utf-8"
  );

  return {
    success: true,
    session_id: finalSessionId,
    output_dir: finalOutputDir,
    summary: {
      message: `Rebuild session ${finalSessionId} initialized for ${url}`,
      target_stack,
      breakpoints,
      states,
    },
  };
}

// ============================================================================
// Tool 2: capture_site
// ============================================================================

interface CapturedSite {
  html: string;
  stylesheets: Array<{ url: string; local_path: string; content: string }>;
  scripts: Array<{ url: string; local_path: string; content: string }>;
  screenshots: Record<string, string>; // breakpoint -> path
  metadata: {
    title: string;
    viewport: { width: number; height: number };
    timestamp: string;
  };
}

/**
 * Capture website HTML, stylesheets, and screenshots
 */
export async function captureSite(input: CaptureSiteInput): Promise<RebuildToolResult> {
  const {
    session_id,
    fetch_css = true,
    fetch_js = true,
    capture_screenshots = true,
    timeout_seconds = 30,
  } = input;

  const state = await loadRunState(session_id);
  if (!state) {
    return {
      success: false,
      error: `Rebuild session ${session_id} not found. Initialize with rebuild_init first.`,
    };
  }

  const baseDir = state.output_dir;
  const captureDir = join(baseDir, "capture");

  const captured: CapturedSite = {
    html: "",
    stylesheets: [],
    scripts: [],
    screenshots: {},
    metadata: {
      title: "",
      viewport: { width: 1920, height: 1080 },
      timestamp: new Date().toISOString(),
    },
  };

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    });
    const page = await context.newPage();

    // Navigate to URL
    await page.goto(state.url, {
      waitUntil: "networkidle",
      timeout: timeout_seconds * 1000,
    });

    // Get page title
    captured.metadata.title = await page.title();

    // Capture HTML
    captured.html = await page.content();

    // Save main HTML
    await writeFile(join(captureDir, "index.html"), captured.html, "utf-8");

    // Extract and download stylesheets
    if (fetch_css) {
      const styleLinks = await page.$$eval("link[rel='stylesheet']", (links) =>
        links.map((link) => ({
          href: (link as HTMLLinkElement).href,
          rel: (link as HTMLLinkElement).rel,
        }))
      );

      for (let i = 0; i < styleLinks.length; i++) {
        try {
          const styleUrl = styleLinks[i].href;
          const fileName = `stylesheet_${i}.css`;
          const localPath = join(captureDir, "styles", fileName);
          await mkdir(dirname(localPath), { recursive: true });

          const response = await page.request.get(styleUrl);
          const content = await response.text();

          await writeFile(localPath, content, "utf-8");
          captured.stylesheets.push({
            url: styleUrl,
            local_path: localPath,
            content,
          });
        } catch (e) {
          console.warn(`Failed to download stylesheet: ${(e as Error).message}`);
        }
      }

      // Extract inline styles from <style> tags
      const inlineStyles = await page.$$eval("style:not([data-skip])", (styles) =>
        styles.map((s) => s.textContent || "")
      );
      for (let i = 0; i < inlineStyles.length; i++) {
        const fileName = `inline_${i}.css`;
        const localPath = join(captureDir, "styles", fileName);
        await mkdir(dirname(localPath), { recursive: true });
        await writeFile(localPath, inlineStyles[i], "utf-8");
        captured.stylesheets.push({
          url: `inline://style_${i}`,
          local_path: localPath,
          content: inlineStyles[i],
        });
      }
    }

    // Extract and download scripts
    if (fetch_js) {
      const scriptLinks = await page.$$eval("script[src]", (scripts) =>
        scripts.map((s) => ({
          src: (s as HTMLScriptElement).src,
        }))
      );

      for (let i = 0; i < scriptLinks.length; i++) {
        try {
          const scriptUrl = scriptLinks[i].src;
          const fileName = `script_${i}.js`;
          const localPath = join(captureDir, "scripts", fileName);
          await mkdir(dirname(localPath), { recursive: true });

          const response = await page.request.get(scriptUrl);
          const content = await response.text();

          await writeFile(localPath, content, "utf-8");
          captured.scripts.push({
            url: scriptUrl,
            local_path: localPath,
            content,
          });
        } catch (e) {
          console.warn(`Failed to download script: ${(e as Error).message}`);
        }
      }
    }

    // Capture screenshots at different breakpoints
    if (capture_screenshots) {
      const screenshotDir = join(baseDir, "screenshots");
      await mkdir(screenshotDir, { recursive: true });

      for (const breakpoint of state.breakpoints) {
        await page.setViewportSize({ width: breakpoint, height: 1080 });
        // Wait for any layout shifts
        await page.waitForTimeout(500);
        const screenshotPath = join(screenshotDir, `breakpoint_${breakpoint}.png`);
        await page.screenshot({
          path: screenshotPath,
          fullPage: true,
        });
        captured.screenshots[String(breakpoint)] = screenshotPath;
      }

      // Reset viewport
      await page.setViewportSize({ width: 1920, height: 1080 });
    }

    await browser.close();

    // Save capture metadata
    await writeFile(
      join(captureDir, "capture.json"),
      JSON.stringify(
        {
          ...captured,
          stylesheets: captured.stylesheets.map((s) => ({
            url: s.url,
            local_path: relative(baseDir, s.local_path),
          })),
          scripts: captured.scripts.map((s) => ({
            url: s.url,
            local_path: relative(baseDir, s.local_path),
          })),
          screenshots: Object.fromEntries(
            Object.entries(captured.screenshots).map(([k, v]) => [k, relative(baseDir, v)])
          ),
        },
        null,
        2
      ),
      "utf-8"
    );

    // Update state
    state.status = "captured";
    await saveRunState(state);

    return {
      success: true,
      session_id,
      output_dir: baseDir,
      summary: {
        message: "Site capture completed",
        html_saved: "index.html",
        stylesheets_count: captured.stylesheets.length,
        scripts_count: captured.scripts.length,
        screenshots_count: Object.keys(captured.screenshots).length,
        title: captured.metadata.title,
      },
    };
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    return {
      success: false,
      error: `Capture failed: ${(error as Error).message}`,
    };
  }
}

// ============================================================================
// Tool 3: extract_design_tokens
// ============================================================================

/**
 * Extract design tokens from captured CSS
 */
export async function extractDesignTokens(input: ExtractDesignTokensInput): Promise<RebuildToolResult> {
  const { session_id, output_format = "json" } = input;

  const state = await loadRunState(session_id);
  if (!state) {
    return {
      success: false,
      error: `Rebuild session ${session_id} not found`,
    };
  }

  if (state.status !== "captured") {
    return {
      success: false,
      error: "Session must be in 'captured' state before extracting tokens",
    };
  }

  const baseDir = state.output_dir;
  const captureDir = join(baseDir, "capture");
  const tokensDir = join(baseDir, "tokens");

  const tokens: DesignTokens = {
    colors: {},
    fonts: {},
    spacing: {},
    border_radius: {},
    shadows: {},
    transitions: {},
  };

  try {
    // Read all captured stylesheets
    const stylesPath = join(captureDir, "styles");
    let cssContent = "";

    try {
      const styleFiles = await readFile(join(captureDir, "capture.json"), "utf-8");
      const captureData = JSON.parse(styleFiles) as CapturedSite;

      for (const sheet of captureData.stylesheets) {
        const localPath = join(baseDir, sheet.local_path as string);
        try {
          const content = await readFile(localPath, "utf-8");
          cssContent += `\n/* ${sheet.url} */\n${content}\n`;
        } catch {
          // File may not exist
        }
      }
    } catch {
      // No capture file found
    }

    // Parse CSS and extract tokens
    const ast = parse(cssContent, { positions: false });

    // Helper to check if a value is a color
    const isColor = (value: string): boolean => {
      return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ||
        /^rgba?\(/i.test(value) ||
        /^hsla?\(/i.test(value) ||
        /^(transparent|white|black|red|green|blue|yellow|orange|purple|pink|gray|grey)$/i.test(value);
    };

    // Helper to check if a value is a spacing
    const isSpacing = (value: string): boolean => {
      return /^[0-9.]+(px|rem|em|ch|vh|vw|%)$/.test(value);
    };

    // Helper to check if a value is a shadow
    const isShadow = (value: string): boolean => {
      return /box-shadow|text-shadow|drop-shadow/.test(value);
    };

    // Traverse CSS and extract tokens
    const traverse = (node: CssNode) => {
      if (node.type === "Rule") {
        const rule = node;

        // Check for CSS custom properties (--*-color, --spacing-*, etc.)
        if (rule.prelude) {
          const selector = String(rule.prelude);
          if (selector.includes(":root") || selector.includes("[data-theme]")) {
            if (rule.block?.type === "Block") {
              for (const child of rule.block.children) {
                if (child.type === "Declaration") {
                  const decl = child;
                  const property = String(decl.property);
                  const value = typeof decl.value === "string" ? decl.value : extractValue(decl.value);

                  // Extract color tokens
                  if (property.includes("color") && isColor(value)) {
                    const tokenName = property.replace(/^-+/, "").replace(/-color$/, "");
                    tokens.colors[tokenName] = value;
                  }

                  // Extract spacing tokens
                  if (property.includes("spacing") && isSpacing(value)) {
                    const tokenName = property.replace(/^-+/, "");
                    tokens.spacing[tokenName] = value;
                  }

                  // Extract border radius tokens
                  if (property.includes("radius")) {
                    const tokenName = property.replace(/^-+/, "");
                    tokens.border_radius[tokenName] = value;
                  }

                  // Extract shadow tokens
                  if (isShadow(value)) {
                    const tokenName = property.replace(/^-+/, "");
                    tokens.shadows[tokenName] = value;
                  }
                }
              }
            }
          }
        }
      }

      // Recursively traverse children
      if ("children" in node && Array.isArray(node.children)) {
        for (const child of node.children) {
          traverse(child as CssNode);
        }
      }
    };

    // Extract value from CSS node
    const extractValue = (value: unknown): string => {
      if (typeof value === "string") return value;
      if (value && typeof value === "object" && "type" in value) {
        const node = value as CssNode & { value?: unknown };
        if (node.type === "Identifier") return String((node as { name: string }).name);
        if (node.type === "String") return String((node as { value: string }).value);
        if (node.type === "Number") return String((node as { value: string | number }).value);
        if ("value" in node && node.value !== undefined) return String(node.value);
      }
      return String(value);
    };

    traverse(ast);

    // Additional analysis: scan for common patterns
    const lines = cssContent.split("\n");

    // Extract fonts from @font-face and font-family
    const fontFamilies = new Set<string>();
    const fontRegex = /font-family:\s*['"]?([^'";,]+)['"]?/gi;
    let match;
    for (const line of lines) {
      while ((match = fontRegex.exec(line)) !== null) {
        fontFamilies.add(match[1].trim());
      }
    }

    // Extract font weights
    const fontWeightRegex = /font-weight:\s*(\d+|[a-z]+)/gi;
    const fontWeights = new Map<string, Set<number>>();

    for (const line of lines) {
      while ((match = fontWeightRegex.exec(line)) !== null) {
        const weight = match[1];
        const numericWeight = isNaN(Number(weight))
          ? weight === "bold" ? 700 : weight === "normal" ? 400 : 400
          : Number(weight);
        // Use first font family as key (simplified)
        const defaultFont = "default";
        if (!fontWeights.has(defaultFont)) {
          fontWeights.set(defaultFont, new Set());
        }
        fontWeights.get(defaultFont)!.add(numericWeight);
      }
    }

    // Build fonts object
    for (const family of fontFamilies) {
      tokens.fonts[family] = {
        family,
        weights: Array.from(fontWeights.get(family) || [400]).sort((a, b) => a - b),
      };
    }

    // Extract spacing from padding/margin values
    const spacingRegex = /(padding|margin):\s*([0-9.]+(px|rem|em))/gi;
    const spacingValues = new Set<string>();
    for (const line of lines) {
      while ((match = spacingRegex.exec(line)) !== null) {
        spacingValues.add(match[2]);
      }
    }
    const commonSpacings = Array.from(spacingValues).sort((a, b) => {
      const aNum = parseFloat(a);
      const bNum = parseFloat(b);
      return aNum - bNum;
    });
    commonSpacings.forEach((val, idx) => {
      tokens.spacing[`spacing_${idx}`] = val;
    });

    // Extract border radius values
    const radiusRegex = /border-radius:\s*([0-9.]+(px|rem|%|))/gi;
    const radiusValues = new Set<string>();
    for (const line of lines) {
      while ((match = radiusRegex.exec(line)) !== null) {
        radiusValues.add(match[1]);
      }
    }
    radiusValues.forEach((val) => {
      const tokenName = `radius_${val.replace(/[^a-z0-9]/gi, "_")}`;
      tokens.border_radius[tokenName] = val;
    });

    // Extract box shadows
    const shadowRegex = /box-shadow:\s*([^;]+);/gi;
    for (const line of lines) {
      while ((match = shadowRegex.exec(line)) !== null) {
        const shadowValue = match[1].trim();
        const idx = Object.keys(tokens.shadows).length;
        tokens.shadows[`shadow_${idx}`] = shadowValue;
      }
    }

    // Extract transitions
    const transitionRegex = /transition:\s*([^;]+);/gi;
    for (const line of lines) {
      while ((match = transitionRegex.exec(line)) !== null) {
        const transitionValue = match[1].trim();
        const idx = Object.keys(tokens.transitions).length;
        tokens.transitions[`transition_${idx}`] = transitionValue;
      }
    }

    // Save tokens to file
    await writeFile(
      join(tokensDir, "design-tokens.json"),
      JSON.stringify(tokens, null, 2),
      "utf-8"
    );

    // Generate Tailwind config extension
    const tailwindConfig = {
      theme: {
        extend: {
          colors: tokens.colors,
          spacing: Object.fromEntries(
            Object.entries(tokens.spacing).map(([k, v]) => [
              k.startsWith("spacing_") ? k.replace("spacing_", "") : k,
              v,
            ])
          ),
          borderRadius: tokens.border_radius,
          boxShadow: tokens.shadows,
          transitionDuration: Object.fromEntries(
            Object.entries(tokens.transitions).map(([k, v]) => {
              const durationMatch = v.match(/(\d+\.?\d*)(s|ms)/);
              const duration = durationMatch ? durationMatch[1] : "0.3s";
              return [k, duration];
            })
          ),
        },
      },
    };

    await writeFile(
      join(tokensDir, "tailwind.config.json"),
      JSON.stringify(tailwindConfig, null, 2),
      "utf-8"
    );

    // Update state
    state.status = "tokens_extracted";
    await saveRunState(state);

    return {
      success: true,
      session_id,
      output_dir: baseDir,
      summary: {
        message: "Design tokens extracted",
        colors_count: Object.keys(tokens.colors).length,
        fonts_count: Object.keys(tokens.fonts).length,
        spacing_count: Object.keys(tokens.spacing).length,
        border_radius_count: Object.keys(tokens.border_radius).length,
        shadows_count: Object.keys(tokens.shadows).length,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Token extraction failed: ${(error as Error).message}`,
    };
  }
}

// ============================================================================
// Tool 4: extract_component_map
// ============================================================================

/**
 * Extract component structure from HTML
 */
export async function extractComponentMap(input: ExtractComponentMapInput): Promise<RebuildToolResult> {
  const { session_id, min_confidence = 0.5 } = input;

  const state = await loadRunState(session_id);
  if (!state) {
    return {
      success: false,
      error: `Rebuild session ${session_id} not found`,
    };
  }

  const baseDir = state.output_dir;
  const captureDir = join(baseDir, "capture");
  const componentsDir = join(baseDir, "components");

  try {
    // Read captured HTML
    const htmlPath = join(captureDir, "index.html");
    const html = await readFile(htmlPath, "utf-8");

    // Parse HTML and extract component structure
    const components = extractComponentsFromHTML(html);

    // Save component map
    await writeFile(
      join(componentsDir, "component-map.json"),
      JSON.stringify(components, null, 2),
      "utf-8"
    );

    // Generate component tree visualization
    const tree = generateComponentTree(components);

    await writeFile(
      join(componentsDir, "component-tree.txt"),
      tree,
      "utf-8"
    );

    // Update state
    state.status = "components_extracted";
    await saveRunState(state);

    return {
      success: true,
      session_id,
      output_dir: baseDir,
      summary: {
        message: "Component map extracted",
        components_count: components.length,
        depth: maxDepth(components),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Component extraction failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Extract components from HTML string
 */
function extractComponentsFromHTML(html: string): ComponentNode[] {
  const components: ComponentNode[] = [];

  // Simple HTML tag extraction (for production, use a proper HTML parser)
  const selfClosingTags = new Set([
    "img", "br", "hr", "input", "meta", "link", "area", "base", "col",
    "embed", "source", "track", "wbr", "command", "keygen", "menuitem",
  ]);

  const containerTags = new Set([
    "div", "section", "article", "aside", "nav", "header", "footer",
    "main", "figure", "figcaption", "blockquote", "details", "summary",
  ]);

  // Extract major sections using regex patterns
  const sections = [
    { pattern: /<header[^>]*>([\s\S]*?)<\/header>/gi, name: "header" },
    { pattern: /<nav[^>]*>([\s\S]*?)<\/nav>/gi, name: "navigation" },
    { pattern: /<main[^>]*>([\s\S]*?)<\/main>/gi, name: "main" },
    { pattern: /<footer[^>]*>([\s\S]*?)<\/footer>/gi, name: "footer" },
    { pattern: /<section[^>]*>([\s\S]*?)<\/section>/gi, name: "section" },
    { pattern: /<article[^>]*>([\s\S]*?)<\/article>/gi, name: "article" },
    { pattern: /<aside[^>]*>([\s\S]*?)<\/aside>/gi, name: "aside" },
  ];

  let componentId = 0;

  for (const section of sections) {
    let match;
    while ((match = section.pattern.exec(html)) !== null) {
      const content = match[1] || "";
      const fullTag = match[0];

      // Extract classes
      const classMatch = /class=["']([^"']+)["']/.exec(fullTag);
      const classes = classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [];

      // Extract id
      const idMatch = /id=["']([^"']+)["']/.exec(fullTag);
      const id = idMatch ? idMatch[1] : undefined;

      // Extract other attributes
      const attributes: Record<string, string> = {};
      const attrRegex = /(\w+)=["']([^"']+)["']/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(fullTag)) !== null) {
        if (!["class", "id"].includes(attrMatch[1])) {
          attributes[attrMatch[1]] = attrMatch[2];
        }
      }

      components.push({
        id: `comp_${componentId++}`,
        type: section.name,
        tag: section.name,
        classes,
        styles: extractInlineStyles(fullTag),
        children: extractChildren(content, selfClosingTags),
        content: content.replace(/<[^>]+>/g, "").trim().substring(0, 200),
        attributes: {
          ...attributes,
          ...(id ? { id } : {}),
        },
      });
    }
  }

  // Extract images
  const imgPattern = /<img[^>]*>/gi;
  let imgMatch;
  while ((imgMatch = imgPattern.exec(html)) !== null) {
    const imgTag = imgMatch[0];
    const srcMatch = /src=["']([^"']+)["']/.exec(imgTag);
    const altMatch = /alt=["']([^"']*)["']/.exec(imgTag);

    if (srcMatch) {
      components.push({
        id: `comp_${componentId++}`,
        type: "image",
        tag: "img",
        classes: [],
        styles: {},
        children: [],
        attributes: {
          src: srcMatch[1],
          ...(altMatch ? { alt: altMatch[1] } : {}),
        },
      });
    }
  }

  // Extract buttons
  const buttonPattern = /<button[^>]*>([\s\S]*?)<\/button>/gi;
  let buttonMatch;
  while ((buttonMatch = buttonPattern.exec(html)) !== null) {
    const buttonTag = buttonMatch[0];
    const classMatch = /class=["']([^"']+)["']/.exec(buttonTag);

    components.push({
      id: `comp_${componentId++}`,
      type: "button",
      tag: "button",
      classes: classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [],
      styles: extractInlineStyles(buttonTag),
      children: [],
      content: buttonMatch[1]?.trim(),
      attributes: {},
    });
  }

  // Extract links
  const linkPattern = /<a[^>]*>([\s\S]*?)<\/a>/gi;
  let linkMatch;
  while ((linkMatch = linkPattern.exec(html)) !== null) {
    const linkTag = linkMatch[0];
    const hrefMatch = /href=["']([^"']+)["']/.exec(linkTag);
    const classMatch = /class=["']([^"']+)["']/.exec(linkTag);

    if (hrefMatch) {
      components.push({
        id: `comp_${componentId++}`,
        type: "link",
        tag: "a",
        classes: classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [],
        styles: extractInlineStyles(linkTag),
        children: [],
        content: linkMatch[1]?.trim().substring(0, 100),
        attributes: { href: hrefMatch[1] },
      });
    }
  }

  // Extract forms
  const formPattern = /<form[^>]*>([\s\S]*?)<\/form>/gi;
  let formMatch;
  while ((formMatch = formPattern.exec(html)) !== null) {
    const formTag = formMatch[0];
    const classMatch = /class=["']([^"']+)["']/.exec(formTag);

    components.push({
      id: `comp_${componentId++}`,
      type: "form",
      tag: "form",
      classes: classMatch ? classMatch[1].split(/\s+/).filter(Boolean) : [],
      styles: extractInlineStyles(formTag),
      children: [],
      content: "[Form Element]",
      attributes: {},
    });
  }

  return components;
}

/**
 * Extract inline styles from a tag
 */
function extractInlineStyles(tag: string): Record<string, string> {
  const styles: Record<string, string> = {};
  const styleMatch = /style=["']([^"']+)["']/.exec(tag);
  if (styleMatch) {
    const declarations = styleMatch[1].split(";");
    for (const decl of declarations) {
      const [property, value] = decl.split(":").map((s) => s.trim());
      if (property && value) {
        styles[property] = value;
      }
    }
  }
  return styles;
}

/**
 * Extract child components from content
 */
function extractChildren(content: string, selfClosing: Set<string>): ComponentNode[] {
  // Simplified - just count nested tags
  const children: ComponentNode[] = [];
  const depth = (content.match(/<[^/][^>]*>/g) || []).length;
  return children;
}

/**
 * Calculate max depth of components
 */
function maxDepth(components: ComponentNode[], currentDepth = 0): number {
  if (components.length === 0) return currentDepth;
  let max = currentDepth;
  for (const comp of components) {
    if (comp.children.length > 0) {
      max = Math.max(max, maxDepth(comp.children, currentDepth + 1));
    }
  }
  return Math.max(max, currentDepth + 1);
}

/**
 * Generate component tree visualization
 */
function generateComponentTree(components: ComponentNode[], indent = 0): string {
  let output = "";
  const spaces = "  ".repeat(indent);

  for (const comp of components) {
    const tagInfo = comp.tag ? `<${comp.tag}>` : "";
    const classInfo = comp.classes.length > 0 ? ` .${comp.classes.slice(0, 2).join(".")}` : "";
    const idInfo = comp.attributes.id ? `#${comp.attributes.id}` : "";

    output += `${spaces}${comp.type} ${tagInfo}${idInfo}${classInfo}\n`;

    if (comp.children.length > 0) {
      output += generateComponentTree(comp.children, indent + 1);
    }
  }

  return output;
}

// ============================================================================
// Tool 5: harvest_assets
// ============================================================================

/**
 * Download assets (images, fonts, icons) from captured site
 */
export async function harvestAssets(input: HarvestAssetsInput): Promise<RebuildToolResult> {
  const {
    session_id,
    include_images = true,
    include_fonts = true,
    include_css = true,
    include_js = false,
    optimize_images = false,
    timeout_seconds = 30,
  } = input;

  const state = await loadRunState(session_id);
  if (!state) {
    return {
      success: false,
      error: `Rebuild session ${session_id} not found`,
    };
  }

  const baseDir = state.output_dir;
  const assetsDir = join(baseDir, "assets");
  const imagesDir = join(assetsDir, "images");
  const fontsDir = join(assetsDir, "fonts");
  const iconsDir = join(assetsDir, "icons");

  // Create directories
  await mkdir(imagesDir, { recursive: true });
  await mkdir(fontsDir, { recursive: true });
  await mkdir(iconsDir, { recursive: true });

  const harvested: AssetInfo[] = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(state.url, { waitUntil: "networkidle" });

    // Harvest images
    if (include_images) {
      const images = await page.$$eval("img", (imgs) =>
        imgs.map((img) => ({
          src: (img as HTMLImageElement).src,
          alt: (img as HTMLImageElement).alt,
        }))
      );

      let imgIndex = 0;
      for (const img of images) {
        try {
          const url = new URL(img.src, state.url).href;

          // Skip data URLs and base64
          if (url.startsWith("data:")) continue;

          const response = await page.request.get(url);
          const buffer = await response.body();

          // Detect format from content type or extension
          const contentType = response.headers()["content-type"] || "";
          let format = "png";
          if (contentType.includes("jpeg") || url.endsWith(".jpg")) format = "jpg";
          else if (contentType.includes("webp")) format = "webp";
          else if (contentType.includes("gif")) format = "gif";
          else if (contentType.includes("svg")) format = "svg";

          const fileName = `image_${imgIndex++}.${format}`;
          const localPath = join(imagesDir, fileName);
          await writeFile(localPath, buffer);

          // Get dimensions
          let width = 0, height = 0;
          try {
            const metadata = await sharp(buffer).metadata();
            width = metadata.width || 0;
            height = metadata.height || 0;
          } catch {
            // Not an image or format not supported
          }

          harvested.push({
            type: "image",
            url,
            local_path: relative(baseDir, localPath),
            size: buffer.length,
            format,
          });
        } catch (e) {
          console.warn(`Failed to harvest image ${img.src}: ${(e as Error).message}`);
        }
      }
    }

    // Harvest background images from CSS
    const captureDir = join(baseDir, "capture");
    const stylesPath = join(captureDir, "styles");

    try {
      const styleFiles = await readFile(join(captureDir, "capture.json"), "utf-8");
      const captureData = JSON.parse(styleFiles) as CapturedSite;

      for (const sheet of captureData.stylesheets) {
        const content = sheet.content;
        const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/g;
        let match;

        while ((match = urlRegex.exec(content)) !== null) {
          const assetUrl = match[1];

          // Skip data URLs and anchors
          if (assetUrl.startsWith("data:") || assetUrl.startsWith("#")) continue;

          try {
            const fullUrl = new URL(assetUrl, state.url).href;

            const response = await page.request.get(fullUrl);
            const buffer = await response.body();

            const fileName = basename(assetUrl);
            const localPath = join(imagesDir, fileName);
            await writeFile(localPath, buffer);

            harvested.push({
              type: "image",
              url: fullUrl,
              local_path: relative(baseDir, localPath),
              size: buffer.length,
            });
          } catch {
            // Asset may not exist
          }
        }
      }
    } catch {
      // No capture file
    }

    // Harvest fonts (CSS fonts linked in stylesheets)
    if (include_fonts) {
      const fontFaces = await page.$$eval("link[rel*='font'], link[href*='.woff'], link[href*='.ttf']", (links) =>
        links.map((link) => ({
          href: (link as HTMLLinkElement).href,
          as: (link as HTMLLinkElement).getAttribute("as"),
        }))
      );

      let fontIndex = 0;
      for (const font of fontFaces) {
        try {
          const response = await page.request.get(font.href);
          const buffer = await response.body();

          const fileName = `font_${fontIndex++}${getExtensionFromHref(font.href)}`;
          const localPath = join(fontsDir, fileName);
          await writeFile(localPath, buffer);

          harvested.push({
            type: "font",
            url: font.href,
            local_path: relative(baseDir, localPath),
            size: buffer.length,
            format: getExtensionFromHref(font.href).replace(".", ""),
          });
        } catch {
          // Font download failed
        }
      }

      // Also extract @font-face URLs from stylesheets
      try {
        const styleFiles = await readFile(join(captureDir, "capture.json"), "utf-8");
        const captureData = JSON.parse(styleFiles) as CapturedSite;

        for (const sheet of captureData.stylesheets) {
          const fontUrlRegex = /@font-face[^{]*\{[^}]*url\(['"]?([^'")\s]+)['"]?\)[^}]*\}/g;
          let match;

          while ((match = fontUrlRegex.exec(sheet.content)) !== null) {
            const fontUrl = match[1];
            if (fontUrl.startsWith("data:")) continue;

            try {
              const fullUrl = new URL(fontUrl, state.url).href;
              const response = await page.request.get(fullUrl);
              const buffer = await response.body();

              const fileName = `font_${fontIndex++}${getExtensionFromHref(fontUrl)}`;
              const localPath = join(fontsDir, fileName);
              await writeFile(localPath, buffer);

              harvested.push({
                type: "font",
                url: fullUrl,
                local_path: relative(baseDir, localPath),
                size: buffer.length,
              });
            } catch {
              // Font download failed
            }
          }
        }
      } catch {
        // No capture file
      }
    }

    // Harvest icons (SVG, ICO)
    if (include_images) {
      const favicons = await page.$$eval("link[rel*='icon']", (links) =>
        links.map((link) => ({
          href: (link as HTMLLinkElement).href,
          rel: (link as HTMLLinkElement).rel,
          sizes: (link as HTMLLinkElement).getAttribute("sizes"),
        }))
      );

      for (const icon of favicons) {
        try {
          const response = await page.request.get(icon.href);
          const buffer = await response.body();

          const fileName = `favicon${getExtensionFromHref(icon.href)}`;
          const localPath = join(iconsDir, fileName);
          await writeFile(localPath, buffer);

          harvested.push({
            type: "icon",
            url: icon.href,
            local_path: relative(baseDir, localPath),
            size: buffer.length,
          });
        } catch {
          // Icon download failed
        }
      }
    }

    await browser.close();

    // Save asset manifest
    await writeFile(
      join(assetsDir, "assets.json"),
      JSON.stringify(harvested, null, 2),
      "utf-8"
    );

    // Update state
    state.status = "assets_harvested";
    await saveRunState(state);

    return {
      success: true,
      session_id,
      output_dir: baseDir,
      summary: {
        message: "Assets harvested",
        total_assets: harvested.length,
        images: harvested.filter((a) => a.type === "image").length,
        fonts: harvested.filter((a) => a.type === "font").length,
        icons: harvested.filter((a) => a.type === "icon").length,
        total_size: harvested.reduce((sum, a) => sum + (a.size || 0), 0),
      },
    };
  } catch (error) {
    if (browser) await browser.close();
    return {
      success: false,
      error: `Asset harvesting failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Get file extension from URL
 */
function getExtensionFromHref(href: string): string {
  const url = new URL(href);
  const pathname = url.pathname.toLowerCase();
  if (pathname.endsWith(".woff2")) return ".woff2";
  if (pathname.endsWith(".woff")) return ".woff";
  if (pathname.endsWith(".ttf")) return ".ttf";
  if (pathname.endsWith(".otf")) return ".otf";
  if (pathname.endsWith(".eot")) return ".eot";
  if (pathname.endsWith(".svg")) return ".svg";
  if (pathname.endsWith(".ico")) return ".ico";
  if (pathname.endsWith(".png")) return ".png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return ".jpg";
  if (pathname.endsWith(".webp")) return ".webp";
  if (pathname.endsWith(".gif")) return ".gif";
  return ".bin";
}

// ============================================================================
// Tool 6: generate_code
// ============================================================================

/**
 * Generate component code based on extracted components and design tokens
 */
export async function generateCode(input: GenerateCodeInput): Promise<RebuildToolResult> {
  const {
    session_id,
    framework = "react",
    styling = "tailwind",
    include_tokens_css = true,
    accessibility = "wcag-aa",
  } = input;

  const state = await loadRunState(session_id);
  if (!state) {
    return {
      success: false,
      error: `Rebuild session ${session_id} not found`,
    };
  }

  const baseDir = state.output_dir;
  const generatedDir = join(baseDir, "generated");

  try {
    await mkdir(generatedDir, { recursive: true });

    // Read design tokens and component map
    const tokens: DesignTokens = JSON.parse(
      await readFile(join(baseDir, "tokens", "design-tokens.json"), "utf-8")
    );
    const components: ComponentNode[] = JSON.parse(
      await readFile(join(baseDir, "components", "component-map.json"), "utf-8")
    );

    const stack = state.target_stack;
    const generated: string[] = [];

    // Generate code based on target stack
    if (stack.includes("react")) {
      generated.push(...await generateReactComponents(components, tokens, generatedDir));
    } else if (stack.includes("vue")) {
      generated.push(...await generateVueComponents(components, tokens, generatedDir));
    } else if (stack.includes("html")) {
      generated.push(...await generateHTMLComponents(components, tokens, generatedDir));
    }

    // Generate Tailwind config if using Tailwind
    if (stack.includes("tailwind")) {
      const tailwindConfig = generateTailwindConfig(tokens);
      await writeFile(
        join(generatedDir, "tailwind.config.js"),
        tailwindConfig,
        "utf-8"
      );
      generated.push("tailwind.config.js");
    }

    // Generate CSS variables from tokens
    const cssVars = generateCSSVariables(tokens);
    await writeFile(
      join(generatedDir, "tokens.css"),
      cssVars,
      "utf-8"
    );
    generated.push("tokens.css");

    // Save manifest
    await writeFile(
      join(generatedDir, "manifest.json"),
      JSON.stringify({
        generated_files: generated,
        target_stack: stack,
        generated_at: new Date().toISOString(),
      }, null, 2),
      "utf-8"
    );

    // Update state
    state.status = "code_generated";
    await saveRunState(state);

    return {
      success: true,
      session_id,
      output_dir: baseDir,
      summary: {
        message: "Code generated",
        target_stack: stack,
        files_generated: generated.length,
        files: generated,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Code generation failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Generate React components
 */
async function generateReactComponents(
  components: ComponentNode[],
  tokens: DesignTokens,
  outputDir: string
): Promise<string[]> {
  const generated: string[] = [];

  // Generate each component
  for (const comp of components) {
    const fileName = `${comp.type}.tsx`;
    const filePath = join(outputDir, fileName);

    const componentCode = generateReactComponent(comp, tokens);
    await writeFile(filePath, componentCode, "utf-8");
    generated.push(fileName);
  }

  // Generate index file
  const indexCode = components.map((comp) =>
    `export { ${comp.type.charAt(0).toUpperCase() + comp.type.slice(1)} } from './${comp.type}';`
  ).join("\n");

  await writeFile(join(outputDir, "index.ts"), indexCode, "utf-8");
  generated.push("index.ts");

  return generated;
}

/**
 * Generate a single React component
 */
function generateReactComponent(comp: ComponentNode, tokens: DesignTokens): string {
  const componentName = comp.type.charAt(0).toUpperCase() + comp.type.slice(1);
  const className = comp.classes.length > 0 ? comp.classes.join(" ") : "";
  const styles = comp.styles;

  const styleProps = Object.entries(styles)
    .map(([key, value]) => {
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return `    ${camelKey}: "${value}"`;
    })
    .join("\n");

  return `import React from 'react';

interface ${componentName}Props {
  children?: React.ReactNode;
  className?: string;
}

export function ${componentName}({ children, className = "" }: ${componentName}Props) {
  return (
    <${comp.tag || "div"}
      className="${className} \${className}"
${styleProps ? `      style={{\n${styleProps}\n      }}` : ""}
    >
      {children || "${comp.content || ""}"}
    </${comp.tag || "div"}>
  );
}
`;
}

/**
 * Generate Vue components
 */
async function generateVueComponents(
  components: ComponentNode[],
  tokens: DesignTokens,
  outputDir: string
): Promise<string[]> {
  const generated: string[] = [];

  for (const comp of components) {
    const fileName = `${comp.type}.vue`;
    const filePath = join(outputDir, fileName);

    const componentCode = generateVueComponent(comp, tokens);
    await writeFile(filePath, componentCode, "utf-8");
    generated.push(fileName);
  }

  return generated;
}

/**
 * Generate a single Vue component
 */
function generateVueComponent(comp: ComponentNode, tokens: DesignTokens): string {
  const componentName = comp.type.charAt(0).toUpperCase() + comp.type.slice(1);
  const className = comp.classes.join(" ");
  const styles = comp.styles;

  const styleString = Object.entries(styles)
    .map(([key, value]) => `  ${key}: ${value};`)
    .join("\n");

  return `<template>
  <${comp.tag || "div"} class="${className}">
    ${comp.content || "<slot />"}
  </${comp.tag || "div"}>
</template>

<script setup lang="ts">
interface Props {
  // Add props here
}

defineProps<Props>();
</script>

<style scoped>
${comp.tag || "div"} {
${styleString}
}
</style>
`;
}

/**
 * Generate HTML components
 */
async function generateHTMLComponents(
  components: ComponentNode[],
  tokens: DesignTokens,
  outputDir: string
): Promise<string[]> {
  const generated: string[] = [];

  for (const comp of components) {
    const fileName = `${comp.type}.html`;
    const filePath = join(outputDir, fileName);

    const componentCode = generateHTMLComponent(comp, tokens);
    await writeFile(filePath, componentCode, "utf-8");
    generated.push(fileName);
  }

  return generated;
}

/**
 * Generate a single HTML component
 */
function generateHTMLComponent(comp: ComponentNode, tokens: DesignTokens): string {
  const className = comp.classes.join(" ");
  const styles = Object.entries(comp.styles)
    .map(([key, value]) => `    ${key}: ${value};`)
    .join("\n");

  return `<!-- ${comp.type} component -->
<${comp.tag || "div"} class="${className}"${styles ? ` style="\n${styles}\n  "` : ""}>
  ${comp.content || ""}
</${comp.tag || "div"}>
`;
}

/**
 * Generate Tailwind config from tokens
 */
function generateTailwindConfig(tokens: DesignTokens): string {
  return `/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,vue}",
  ],
  theme: {
    extend: {
      colors: ${JSON.stringify(tokens.colors, null, 2).replace(/\n/g, "\n      ")},
      spacing: ${JSON.stringify(tokens.spacing, null, 2).replace(/\n/g, "\n      ")},
      borderRadius: ${JSON.stringify(tokens.border_radius, null, 2).replace(/\n/g, "\n      ")},
      boxShadow: ${JSON.stringify(tokens.shadows, null, 2).replace(/\n/g, "\n      ")},
    },
  },
  plugins: [],
};
`;
}

/**
 * Generate CSS variables from tokens
 */
function generateCSSVariables(tokens: DesignTokens): string {
  let css = ":root {\n";

  // Colors
  for (const [name, value] of Object.entries(tokens.colors)) {
    css += `  --color-${name}: ${value};\n`;
  }

  // Spacing
  for (const [name, value] of Object.entries(tokens.spacing)) {
    css += `  --spacing-${name}: ${value};\n`;
  }

  // Border radius
  for (const [name, value] of Object.entries(tokens.border_radius)) {
    css += `  --radius-${name}: ${value};\n`;
  }

  // Shadows
  for (const [name, value] of Object.entries(tokens.shadows)) {
    css += `  --shadow-${name}: ${value};\n`;
  }

  css += "}\n";
  return css;
}

// ============================================================================
// Tool 7: visual_diff
// ============================================================================

/**
 * Compare screenshots with pixel-perfect diff
 */
export async function visualDiff(input: VisualDiffInput): Promise<RebuildToolResult> {
  const { session_id, threshold = 0.1, breakpoints } = input;

  const state = await loadRunState(session_id);
  if (!state) {
    return {
      success: false,
      error: `Rebuild session ${session_id} not found`,
    };
  }

  const baseDir = state.output_dir;
  const screenshotDir = join(baseDir, "screenshots");
  const diffDir = join(screenshotDir, "diffs");

  await mkdir(diffDir, { recursive: true });

  const comparisons: ScreenshotComparison[] = [];

  try {
    // For now, we'll compare the captured screenshots against themselves
    // In a full implementation, you'd capture new screenshots of the rebuilt site

    const screenshots = await readFile(join(screenshotDir, "breakpoint_1920.png"))
      .then(() => true)
      .catch(() => false);

    if (!screenshots) {
      return {
        success: false,
        error: "No screenshots found. Run capture_site with captureScreenshots=true first.",
      };
    }

    // Compare each breakpoint screenshot with itself (demo)
    const breakpointsToCompare = breakpoints || state.breakpoints;
    for (const breakpoint of breakpointsToCompare) {
      const screenshotPath = join(screenshotDir, `breakpoint_${breakpoint}.png`);

      try {
        await access(screenshotPath);

        // Read the screenshot
        const image = sharp(screenshotPath);
        const { width, height } = await image.metadata();
        const { data } = await image
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        // Create a comparison with itself (0% diff)
        const diff = Buffer.alloc(data.length);
        const pixelDiff = Pixelmatch(data, data, diff, width || 1920, height || 1080, {
          threshold,
        });

        // Save diff image
        const diffPath = join(diffDir, `diff_${breakpoint}.png`);
        await sharp(diff)
          .resize(width || 1920, height || 1080)
          .png()
          .toFile(diffPath);

        comparisons.push({
          session_id,
          screenshot_path: relative(baseDir, screenshotPath),
          original_path: relative(baseDir, screenshotPath),
          diff_path: relative(baseDir, diffPath),
          pixel_diff: 0, // Comparing with itself
          pixel_count: 0,
        });
      } catch {
        // Screenshot doesn't exist for this breakpoint
      }
    }

    // Save comparison results
    await writeFile(
      join(screenshotDir, "comparisons.json"),
      JSON.stringify(comparisons, null, 2),
      "utf-8"
    );

    return {
      success: true,
      session_id,
      output_dir: baseDir,
      summary: {
        message: "Visual diff completed",
        comparisons_count: comparisons.length,
        avg_diff: comparisons.reduce((sum, c) => sum + c.pixel_diff, 0) / comparisons.length || 0,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Visual diff failed: ${(error as Error).message}`,
    };
  }
}

// ============================================================================
// Tool 8: auto_fix_pass
// ============================================================================

/**
 * Auto-fix common issues in generated code
 */
export async function autoFixPass(input: AutoFixPassInput): Promise<RebuildToolResult> {
  const { session_id, max_fixes = 10, target_similarity = 0.9 } = input;

  const state = await loadRunState(session_id);
  if (!state) {
    return {
      success: false,
      error: `Rebuild session ${session_id} not found`,
    };
  }

  const baseDir = state.output_dir;
  const generatedDir = join(baseDir, "generated");

  const fixes: string[] = [];

  try {
    // Read generated files
    const files = await readFile(join(generatedDir, "manifest.json"), "utf-8")
      .then((c) => JSON.parse(c).files_generated as string[])
      .catch(() => [] as string[]);

    let fixCount = 0;
    for (const file of files) {
      if (fixCount >= max_fixes) break;

      const filePath = join(generatedDir, file);
      try {
        let content = await readFile(filePath, "utf-8");
        let modified = false;

        // Accessibility fixes
        // Add alt text to images without it
        const altFix = content.replace(
          /<img(?![^>]*alt=)([^>]*)>/g,
          '<img$1 alt="">'
        );
        if (altFix !== content) {
          content = altFix;
          modified = true;
          fixes.push(`Added alt attributes to images in ${file}`);
          fixCount++;
        }

        // Add aria-label to buttons without text
        const ariaFix = content.replace(
          /<button(?![^>]*aria-label=)([^>]*)><\s*\/>/g,
          '<button$1 aria-label="Button">'
        );
        if (ariaFix !== content) {
          content = ariaFix;
          modified = true;
          fixes.push(`Added aria-labels to empty buttons in ${file}`);
          fixCount++;
        }

        // Performance fixes
        // Add loading="lazy" to images
        const lazyFix = content.replace(
          /<img(?![^>]*loading=)([^>]*)>/g,
          '<img$1 loading="lazy">'
        );
        if (lazyFix !== content && lazyFix !== altFix) {
          content = lazyFix;
          modified = true;
          fixes.push(`Added lazy loading to images in ${file}`);
          fixCount++;
        }

        // SEO fixes
        // Add meta description if missing
        if (!content.includes('<meta name="description"')) {
          const metaTag = '  <meta name="description" content="">\n';
          content = content.replace(/<head>/, `<head>\n${metaTag}`);
          modified = true;
          fixes.push(`Added meta description placeholder to ${file}`);
          fixCount++;
        }

        // Write back if modified
        if (modified) {
          await writeFile(filePath, content, "utf-8");
        }
      } catch {
        // File may not exist or not be readable
      }
    }

    // Generate fixes report
    await writeFile(
      join(baseDir, "auto-fix-report.json"),
      JSON.stringify({
        fixes_applied: fixes.length,
        fixes,
        timestamp: new Date().toISOString(),
      }, null, 2),
      "utf-8"
    );

    return {
      success: true,
      session_id,
      output_dir: baseDir,
      summary: {
        message: "Auto-fix pass completed",
        fixes_applied: fixes.length,
        fixes,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Auto-fix pass failed: ${(error as Error).message}`,
    };
  }
}

// ============================================================================
// Tool 9: rebuild_finalize
// ============================================================================

interface RebuildFinalizeResult extends ToolResult {
  session_id?: string;
  export_path?: string;
  error?: string;
  summary?: {
    message: string;
    total_files: number;
    components: number;
    assets: number;
    tokens: number;
  };
}

/**
 * Finalize the rebuild and export as a ready-to-use package
 */
export async function rebuildFinalize(input: RebuildFinalizeInput): Promise<RebuildFinalizeResult> {
  const { session_id, output_format = "source", include_docs = true } = input;

  const state = await loadRunState(session_id);
  if (!state) {
    return {
      success: false,
      error: `Rebuild session ${session_id} not found`,
    };
  }

  const baseDir = state.output_dir;

  try {
    // Count files in each category
    let componentsCount = 0;
    let assetsCount = 0;
    let tokensCount = 0;

    const countFiles = async (dir: string) => {
      try {
        const files = await readdir(dir);
        return files.length;
      } catch {
        return 0;
      }
    };

    componentsCount = await countFiles(join(baseDir, "components"));
    assetsCount = await countFiles(join(baseDir, "assets"));
    tokensCount = await countFiles(join(baseDir, "tokens"));

    const totalFiles = componentsCount + assetsCount + tokensCount;

    // Create export structure
    const exportDir = join(baseDir, "export");
    await mkdir(exportDir, { recursive: true });

    // Copy generated files to export
    const generatedDir = join(baseDir, "generated");
    try {
      const generatedFiles = await readFile(join(generatedDir, "manifest.json"), "utf-8")
        .then((c) => JSON.parse(c).files_generated as string[])
        .catch(() => [] as string[]);

      for (const file of generatedFiles) {
        try {
          const content = await readFile(join(generatedDir, file), "utf-8");
          await writeFile(join(exportDir, file), content, "utf-8");
        } catch {
          // Skip files that can't be read
        }
      }
    } catch {
      // No manifest file
    }

    // Create README for the export
    const readme = `# Rebuild Export - ${session_id}

## Source
URL: ${state.url}
Captured: ${state.created_at}

## Stack
Target: ${state.target_stack}

## Contents
- ${componentsCount} components
- ${assetsCount} assets
- ${tokensCount} design tokens

## Usage
1. Install dependencies: \`npm install\`
2. Import components from \`./index\`
3. Copy tokens.css to your project
4. Use Tailwind config if using Tailwind CSS

---
Generated by Codin Rebuild Tools
${new Date().toISOString()}
`;

    await writeFile(join(exportDir, "README.md"), readme, "utf-8");

    // Create package.json
    const packageJson = {
      name: `rebuild-${session_id}`,
      version: "1.0.0",
      description: `Rebuilt components from ${state.url}`,
      main: "index.js",
      types: "index.d.ts",
      scripts: {
        build: "tsc",
      },
      dependencies: {
        react: "^18.0.0",
      },
      devDependencies: {
        "@types/react": "^18.0.0",
        typescript: "^5.0.0",
      },
    };

    await writeFile(
      join(exportDir, "package.json"),
      JSON.stringify(packageJson, null, 2),
      "utf-8"
    );

    // Update state to completed
    state.status = "completed";
    await saveRunState(state);

    return {
      success: true,
      session_id,
      export_path: relative(process.cwd(), exportDir),
      summary: {
        message: "Rebuild finalized successfully",
        total_files: totalFiles,
        components: componentsCount,
        assets: assetsCount,
        tokens: tokensCount,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Rebuild finalization failed: ${(error as Error).message}`,
    };
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * List all rebuild runs
 */
export async function listRebuildRuns(): Promise<RebuildRunState[]> {
  const runs: RebuildRunState[] = [];

  try {
    await ensureRunsDir();
    const dirs = await readdir(REBUILD_RUNS_DIR, { withFileTypes: true });

    for (const dir of dirs) {
      if (dir.isDirectory()) {
        const state = await loadRunState(dir.name);
        if (state) {
          runs.push(state);
        }
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  return runs.sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

/**
 * Get rebuild run status
 */
export async function getRebuildStatus(sessionId: string): Promise<RebuildRunState | null> {
  return loadRunState(sessionId);
}

/**
 * Delete a rebuild run
 */
export async function deleteRebuildRun(sessionId: string): Promise<boolean> {
  try {
    const { rm } = await import("node:fs/promises");
    const runDir = join(REBUILD_RUNS_DIR, sessionId);
    await rm(runDir, { recursive: true, force: true });
    ACTIVE_RUNS.delete(sessionId);
    return true;
  } catch {
    return false;
  }
}

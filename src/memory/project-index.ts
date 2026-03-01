/**
 * Project Index
 * File scanning, hashing, and symbol extraction
 * Maintains an index of project files and their contents
 */

import { readFile, stat, readdir } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import { createHash } from "node:crypto";
import { cwd } from "node:process";

import type {
  IndexedFile,
  SymbolInfo,
  FileContext,
  ProjectScanResult,
} from "./types.js";
import {
  MemoryDatabase,
  generateId,
  safeJsonParse,
  safeJsonStringify,
} from "./db.js";

// ============================================================================
// Language Detection
// ============================================================================

const LANGUAGE_MAP: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".kt": "kotlin",
  ".cpp": "cpp",
  ".c": "c",
  ".h": "c",
  ".cs": "csharp",
  ".php": "php",
  ".rb": "ruby",
  ".swift": "swift",
  ".dart": "dart",
  ".lua": "lua",
  ".sql": "sql",
  ".sh": "shell",
  ".json": "json",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".toml": "toml",
  ".xml": "xml",
  ".html": "html",
  ".css": "css",
  ".scss": "scss",
  ".less": "less",
  ".md": "markdown",
  ".txt": "text",
  ".dockerfile": "dockerfile",
};

export function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const name = basename(filePath).toLowerCase();

  // Special cases
  if (name === "dockerfile") return "dockerfile";
  if (name === ".gitignore") return "gitignore";
  if (name === ".env") return "env";

  return LANGUAGE_MAP[ext] || "unknown";
}

// ============================================================================
// File Hashing
// ============================================================================

/**
 * Compute SHA-256 hash of file content
 */
export async function hashFile(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, "utf-8");
    return createHash("sha256").update(content).digest("hex");
  } catch {
    return "";
  }
}

/**
 * Quick hash using only file stats (faster for change detection)
 */
export async function quickHash(filePath: string): Promise<string> {
  try {
    const stats = await stat(filePath);
    return `${stats.mtimeMs}-${stats.size}`;
  } catch {
    return "";
  }
}

// ============================================================================
// Symbol Extraction
// ============================================================================

/**
 * Extract symbols from source code based on language
 */
export function extractSymbols(filePath: string, content: string): SymbolInfo[] {
  const language = detectLanguage(filePath);
  const symbols: SymbolInfo[] = [];

  // Extract based on language
  switch (language) {
    case "typescript":
    case "javascript":
      symbols.push(...extractJSSymbols(filePath, content));
      break;
    case "python":
      symbols.push(...extractPythonSymbols(filePath, content));
      break;
    case "rust":
      symbols.push(...extractRustSymbols(filePath, content));
      break;
    case "go":
      symbols.push(...extractGoSymbols(filePath, content));
      break;
    default:
      // For unknown languages, do basic regex-based extraction
      symbols.push(...extractGenericSymbols(filePath, content));
  }

  return symbols;
}

/**
 * Extract JavaScript/TypeScript symbols
 */
function extractJSSymbols(filePath: string, content: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const lines = content.split("\n");

  // Patterns for JS/TS
  const patterns = [
    // Classes: `class MyClass {` or `export class MyClass {`
    { regex: /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/g, type: "class" as const },
    // Interfaces: `interface MyInterface {`
    { regex: /(?:export\s+)?interface\s+(\w+)/g, type: "interface" as const },
    // Type aliases: `type MyType =`
    { regex: /(?:export\s+)?type\s+(\w+)\s*=/g, type: "type" as const },
    // Enums: `enum MyEnum {`
    { regex: /(?:export\s+)?(?:const\s+)?enum\s+(\w+)/g, type: "enum" as const },
    // Functions: `function myFunc(` or `export function myFunc(`
    { regex: /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/g, type: "function" as const },
    // Const functions/exports: `const myFunc = (`
    { regex: /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\(/g, type: "function" as const },
    // Variables: `const myVar =` (not functions)
    { regex: /(?:export\s+)?const\s+(\w+)\s*=\s*(?!async\s*\()[^(\s]/g, type: "const" as const },
  ];

  for (const { regex, type } of patterns) {
    regex.lastIndex = 0; // Reset regex
    let match;

    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      symbols.push({
        id: generateId(`${filePath}:${type}:${name}`),
        filePath,
        symbolType: type,
        name,
        lineStart: lineNumber,
      });
    }
  }

  return symbols;
}

/**
 * Extract Python symbols
 */
function extractPythonSymbols(filePath: string, content: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];
  const lines = content.split("\n");

  // Python patterns
  const patterns = [
    { regex: /^class\s+(\w+)/gm, type: "class" as const },
    { regex: /^async\s+def\s+(\w+)/gm, type: "function" as const },
    { regex: /^def\s+(\w+)/gm, type: "function" as const },
    { regex: /^(\w+)\s*=\s*(?!.*def\s).*$/gm, type: "variable" as const },
  ];

  for (const { regex, type } of patterns) {
    let match;

    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      symbols.push({
        id: generateId(`${filePath}:${type}:${name}`),
        filePath,
        symbolType: type,
        name,
        lineStart: lineNumber,
      });
    }
  }

  return symbols;
}

/**
 * Extract Rust symbols
 */
function extractRustSymbols(filePath: string, content: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  const patterns = [
    { regex: /(?:pub\s+)?(?:struct|enum|union)\s+(\w+)/g, type: "class" as const },
    { regex: /(?:pub\s+)?trait\s+(\w+)/g, type: "interface" as const },
    { regex: /(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/g, type: "function" as const },
    { regex: /(?:pub\s+)?const\s+(\w+)/g, type: "const" as const },
    { regex: /(?:pub\s+)?type\s+(\w+)/g, type: "type" as const },
  ];

  for (const { regex, type } of patterns) {
    let match;

    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      symbols.push({
        id: generateId(`${filePath}:${type}:${name}`),
        filePath,
        symbolType: type,
        name,
        lineStart: lineNumber,
      });
    }
  }

  return symbols;
}

/**
 * Extract Go symbols
 */
function extractGoSymbols(filePath: string, content: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  const patterns = [
    { regex: /type\s+(\w+)\s+struct/g, type: "class" as const },
    { regex: /type\s+(\w+)\s+interface/g, type: "interface" as const },
    { regex: /func\s+(?:\(\w*\s+\*?\w+\)\s+)?(\w+)/g, type: "function" as const },
    { regex: /const\s+(\w+)/g, type: "const" as const },
    { regex: /var\s+(\w+)/g, type: "variable" as const },
  ];

  for (const { regex, type } of patterns) {
    let match;

    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      symbols.push({
        id: generateId(`${filePath}:${type}:${name}`),
        filePath,
        symbolType: type,
        name,
        lineStart: lineNumber,
      });
    }
  }

  return symbols;
}

/**
 * Extract generic symbols (basic regex-based)
 */
function extractGenericSymbols(filePath: string, content: string): SymbolInfo[] {
  const symbols: SymbolInfo[] = [];

  // Very basic extraction - look for common patterns
  const functionPatterns = [
    /function\s+(\w+)\s*\(/g,
    /def\s+(\w+)\s*\(/g,
    /fn\s+(\w+)\s*\(/g,
  ];

  for (const regex of functionPatterns) {
    let match;
    regex.lastIndex = 0;

    while ((match = regex.exec(content)) !== null) {
      const name = match[1];
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split("\n").length;

      symbols.push({
        id: generateId(`${filePath}:function:${name}`),
        filePath,
        symbolType: "function",
        name,
        lineStart: lineNumber,
      });
    }
  }

  return symbols;
}

/**
 * Extract imports from source code
 */
export function extractImports(filePath: string, content: string): string[] {
  const language = detectLanguage(filePath);
  const imports: string[] = [];

  switch (language) {
    case "typescript":
    case "javascript":
      // ES6 imports: `import ... from '...'`
      const es6Imports = content.matchAll(/import\s+(?:[\s\S]*?from\s+)?['"`]([^'"`]+)['"`]/g);
      for (const match of es6Imports) {
        if (match[1]) imports.push(match[1]);
      }
      // CommonJS: `require('...')`
      const cjsImports = content.matchAll(/require\(['"`]([^'"`]+)['"`]\)/g);
      for (const match of cjsImports) {
        if (match[1]) imports.push(match[1]);
      }
      break;

    case "python":
      // `import ...` or `from ... import ...`
      const pyImports = content.matchAll(/(?:import|from)\s+([^\s;]+)/g);
      for (const match of pyImports) {
        if (match[1]) imports.push(match[1]);
      }
      break;

    case "rust":
      // `use ...;`
      const rustImports = content.matchAll(/use\s+([^;]+);/g);
      for (const match of rustImports) {
        if (match[1]) imports.push(match[1].trim());
      }
      break;

    case "go":
      // Go imports are more complex, skip for now
      break;
  }

  return [...new Set(imports)]; // Deduplicate
}

/**
 * Extract exports from source code
 */
export function extractExports(filePath: string, content: string): string[] {
  const language = detectLanguage(filePath);
  const exports: string[] = [];

  switch (language) {
    case "typescript":
    case "javascript":
      // `export function`, `export class`, `export const`, `export default`
      const namedExports = content.matchAll(/export\s+(?:(?:async\s+)?(?:function|class|const|type|interface)\s+)?(\w+)/g);
      for (const match of namedExports) {
        if (match[1]) exports.push(match[1]);
      }
      break;
  }

  return [...new Set(exports)];
}

// ============================================================================
// Project Index
// ============================================================================

export class ProjectIndex {
  private db: MemoryDatabase;
  private rootPath: string;
  private excludePatterns: RegExp[];

  constructor(
    db: MemoryDatabase,
    rootPath: string = cwd(),
    excludePatterns: string[] = []
  ) {
    this.db = db;
    this.rootPath = rootPath;
    this.excludePatterns = excludePatterns.map((p) => new RegExp(p));
  }

  /**
   * Scan the project and build the index
   */
  async scan(options?: {
    force?: boolean;
    maxFiles?: number;
    onProgress?: (current: number, total: number, file: string) => void;
  }): Promise<ProjectScanResult> {
    const startTime = Date.now();
    const db = this.db.getDb();

    let filesScanned = 0;
    let filesAdded = 0;
    let filesUpdated = 0;
    let filesRemoved = 0;
    let symbolsExtracted = 0;

    // Get all files in the project
    const files = await this.collectFiles();
    const totalFiles = files.length;

    if (options?.maxFiles && files.length > options.maxFiles) {
      // File count exceeds limit
    }

    // Track existing files to detect deletions
    const existingPaths = new Set(
      db
        .prepare("SELECT path FROM indexed_files")
        .all()
        .map((row: any) => row.path)
    );

    const limit = options?.maxFiles || files.length;

    for (let i = 0; i < Math.min(files.length, limit); i++) {
      const filePath = files[i];
      filesScanned++;

      options?.onProgress?.(i + 1, totalFiles, filePath);

      try {
        const relativePath = relative(this.rootPath, filePath);
        const stats = await stat(filePath);
        const language = detectLanguage(filePath);
        const content = await readFile(filePath, "utf-8");
        const hash = createHash("sha256").update(content).digest("hex");

        // Check if file needs updating
        const existing = db
          .prepare("SELECT * FROM indexed_files WHERE path = ?")
          .get(relativePath) as IndexedFile | undefined;

        if (existing) {
          existingPaths.delete(relativePath);

          if (existing.hash === hash) {
            // No change, skip
            continue;
          }

          // File changed, update
          db.prepare(
            `
            UPDATE indexed_files
            SET hash = ?, last_modified = ?, size = ?, language = ?, content = ?
            WHERE path = ?
          `
          ).run(hash, stats.mtimeMs, stats.size, language, content, relativePath);

          filesUpdated++;
        } else {
          // New file
          db.prepare(
            `
            INSERT INTO indexed_files (path, hash, last_modified, size, language, content)
            VALUES (?, ?, ?, ?, ?, ?)
          `
          ).run(relativePath, hash, stats.mtimeMs, stats.size, language, content);

          filesAdded++;
        }

        // Extract and index symbols
        const symbols = extractSymbols(filePath, content);
        for (const symbol of symbols) {
          // Remove old symbols for this file
          db.prepare("DELETE FROM symbols WHERE file_path = ?").run(relativePath);

          // Insert new symbols
          db.prepare(
            `
            INSERT OR REPLACE INTO symbols (id, file_path, symbol_type, name, line_start, line_end, parent, signature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `
          ).run(
            symbol.id,
            relativePath,
            symbol.symbolType,
            symbol.name,
            symbol.lineStart,
            symbol.lineEnd || null,
            symbol.parent || null,
            symbol.signature || null
          );

          symbolsExtracted++;
        }

        // Extract imports and exports
        const imports = extractImports(filePath, content);
        const exports_exp = extractExports(filePath, content);

        // Clear old imports/exports
        db.prepare("DELETE FROM file_imports WHERE file_path = ?").run(relativePath);
        db.prepare("DELETE FROM file_exports WHERE file_path = ?").run(relativePath);

        // Insert imports
        for (const imp of imports) {
          db.prepare("INSERT INTO file_imports (file_path, import_path, import_type) VALUES (?, ?, ?)").run(
            relativePath,
            imp,
            "import"
          );
        }

        // Insert exports
        for (const exp of exports_exp) {
          db.prepare("INSERT INTO file_exports (file_path, export_name, export_type) VALUES (?, ?, ?)").run(
            relativePath,
            exp,
            "export"
          );
        }
      } catch (error) {
        // Failed to index file
      }
    }

    // Remove files that no longer exist
    for (const deletedPath of existingPaths) {
      db.prepare("DELETE FROM indexed_files WHERE path = ?").run(deletedPath);
      db.prepare("DELETE FROM symbols WHERE file_path = ?").run(deletedPath);
      db.prepare("DELETE FROM file_imports WHERE file_path = ?").run(deletedPath);
      db.prepare("DELETE FROM file_exports WHERE file_path = ?").run(deletedPath);
      filesRemoved++;
    }

    const duration = Date.now() - startTime;

    return {
      filesScanned,
      filesAdded,
      filesUpdated,
      filesRemoved,
      symbolsExtracted,
      durationMs: duration,
    };
  }

  /**
   * Collect all files in the project directory
   */
  private async collectFiles(): Promise<string[]> {
    const files: string[] = [];
    const seen = new Set<string>();
    const rootPath = this.rootPath;
    const isExcluded = this.isExcluded.bind(this);

    async function walk(dir: string) {
      try {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          const relativePath = relative(rootPath, fullPath);

          // Skip excluded paths
          if (isExcluded(relativePath)) {
            continue;
          }

          if (entry.isDirectory()) {
            // Recurse into subdirectories
            await walk(fullPath);
          } else if (entry.isFile()) {
            // Skip very large files
            try {
              const stats = await stat(fullPath);
              if (stats.size > 1024 * 1024) {
                // Skip files > 1MB
                continue;
              }
            } catch {
              // Skip files we can't stat
              continue;
            }

            // Only index text files
            const language = detectLanguage(fullPath);
            if (language !== "unknown" || entry.name.endsWith(".md") || entry.name.endsWith(".txt")) {
              if (!seen.has(relativePath)) {
                files.push(fullPath);
                seen.add(relativePath);
              }
            }
          }
        }
      } catch (error) {
        // Error reading directory
      }
    }

    await walk(this.rootPath);
    return files;
  }

  /**
   * Check if a path should be excluded
   */
  private isExcluded(path: string): boolean {
    // Always exclude common directories
    const defaultExcludes = [
      "node_modules",
      ".git",
      "dist",
      "build",
      "target",
      "vendor",
      ".venv",
      "venv",
      "__pycache__",
      ".next",
      ".nuxt",
      "coverage",
    ];

    const parts = path.split(/[/\\]/);
    for (const part of parts) {
      if (defaultExcludes.includes(part)) {
        return true;
      }
    }

    // Check custom patterns
    for (const pattern of this.excludePatterns) {
      if (pattern.test(path)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get file context by path
   */
  getFileContext(path: string): FileContext | null {
    const db = this.db.getDb();
    const file = db
      .prepare("SELECT * FROM indexed_files WHERE path = ?")
      .get(path) as IndexedFile | undefined;

    if (!file) return null;

    const symbols = db
      .prepare("SELECT * FROM symbols WHERE file_path = ?")
      .all(path) as SymbolInfo[];

    const imports = db
      .prepare("SELECT import_path FROM file_imports WHERE file_path = ?")
      .all(path) as Array<{ import_path: string }>;

    const exports = db
      .prepare("SELECT export_name FROM file_exports WHERE file_path = ?")
      .all(path) as Array<{ export_name: string }>;

    return {
      file,
      symbols,
      imports: imports.map((i) => i.import_path),
      exports: exports.map((e) => e.export_name),
    };
  }

  /**
   * Find a symbol by name
   */
  findSymbol(name: string, type?: string): SymbolInfo[] {
    const db = this.db.getDb();

    let sql = "SELECT * FROM symbols WHERE name = ?";
    const params: unknown[] = [name];

    if (type) {
      sql += " AND symbol_type = ?";
      params.push(type);
    }

    const rows = db.prepare(sql).all(...params) as SymbolInfo[];
    return rows;
  }

  /**
   * Search for symbols by pattern
   */
  searchSymbols(query: string, limit = 20): SymbolInfo[] {
    const db = this.db.getDb();
    const pattern = `%${query}%`;

    const rows = db
      .prepare(
        `
        SELECT * FROM symbols
        WHERE name LIKE ? OR signature LIKE ?
        ORDER BY
          CASE
            WHEN name LIKE ? THEN 1
            ELSE 2
          END,
          name
        LIMIT ?
      `
      )
      .all(pattern, pattern, `${query}%`, limit) as SymbolInfo[];

    return rows;
  }

  /**
   * Search for files by name or content
   */
  searchFiles(query: string, limit = 20): IndexedFile[] {
    const db = this.db.getDb();
    const pattern = `%${query}%`;

    const rows = db
      .prepare(
        `
        SELECT * FROM indexed_files
        WHERE path LIKE ? OR content LIKE ?
        ORDER BY importance_score DESC
        LIMIT ?
      `
      )
      .all(pattern, pattern, limit) as IndexedFile[];

    return rows;
  }

  /**
   * Update importance score for a file
   */
  updateImportance(path: string, delta: number): void {
    const db = this.db.getDb();
    db
      .prepare(
        `
        UPDATE indexed_files
        SET importance_score = MAX(0, MIN(1, importance_score + ?))
        WHERE path = ?
      `
      )
      .run(delta, path);
  }

  /**
   * Get indexed files by language
   */
  getFilesByLanguage(language: string): IndexedFile[] {
    const db = this.db.getDb();
    return db
      .prepare("SELECT * FROM indexed_files WHERE language = ? ORDER BY importance_score DESC")
      .all(language) as IndexedFile[];
  }

  /**
   * Get index statistics
   */
  getStats(): {
    totalFiles: number;
    totalSymbols: number;
    byLanguage: Record<string, number>;
    lastScan: string;
  } {
    const db = this.db.getDb();

    const totalFiles = (db.prepare("SELECT COUNT(*) as count FROM indexed_files").get() as { count: number }).count;
    const totalSymbols = (db.prepare("SELECT COUNT(*) as count FROM symbols").get() as { count: number }).count;

    const byLanguageRows = db
      .prepare("SELECT language, COUNT(*) as count FROM indexed_files GROUP BY language")
      .all() as Array<{ language: string; count: number }>;
    const byLanguage: Record<string, number> = {};
    for (const row of byLanguageRows) {
      byLanguage[row.language] = row.count;
    }

    // Get most recent file modification time as last scan
    const lastScanRow = db
      .prepare("SELECT MAX(last_modified) as last_scan FROM indexed_files")
      .get() as { last_scan: number | null };

    return {
      totalFiles,
      totalSymbols,
      byLanguage,
      lastScan: lastScanRow?.last_scan
        ? new Date(lastScanRow.last_scan).toISOString()
        : new Date().toISOString(),
    };
  }

  /**
   * Clear the entire index
   */
  clear(): void {
    const db = this.db.getDb();
    db.prepare("DELETE FROM indexed_files").run();
    db.prepare("DELETE FROM symbols").run();
    db.prepare("DELETE FROM file_imports").run();
    db.prepare("DELETE FROM file_exports").run();
  }
}

// ============================================================================
// Preset Exclude Patterns
// ============================================================================

export const DEFAULT_EXCLUDE_PATTERNS = [
  "\\.(git|svn|hg)", // Version control
  "node_modules", "vendor", "third_party", // Dependencies
  "dist", "build", "out", "bin", // Build outputs
  "coverage", ".nyc_output", // Test coverage
  "\\.min\\.(js|css)$", // Minified files
  "package-lock\\.json", "yarn\\.lock", "pnpm-lock\\.yaml", // Lock files
  "\\.log$", // Log files
];

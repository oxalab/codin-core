/**
 * Tools Layer
 * Export all tool implementations
 */

// File operations
export { readFile } from "./read-file";
export { writeFile } from "./write-file";
export { listFiles } from "./list-files";
export { grep } from "./grep";
export { bashRunner } from "./bash-runner";
export { editFile } from "./edit-file";
export { multiEdit } from "./multi-edit";
export { searchAndReplace } from "./search-and-replace";

// Git operations
export { gitStatus, gitDiff } from "./git-tools";

// Agent tools
export { todoWrite, task } from "./agent-tools";

// File management
export { copyFile, moveFile, deleteFile, createDirectory, compress, extract } from "./file-management";

// Rebuild tools
export {
  rebuildInit,
  captureSite,
  extractDesignTokens,
  extractComponentMap,
  harvestAssets,
  generateCode,
  visualDiff,
  autoFixPass,
  rebuildFinalize,
} from "./rebuild-tools";

// Web tools (FREE - no API costs)
export { webSearch } from "./web-search";
export { webFetch } from "./web-fetch";
export { fetchUrl } from "./fetch";

// Import all for TOOL_REGISTRY
import { readFile as _readFile } from "./read-file";
import { writeFile as _writeFile } from "./write-file";
import { listFiles as _listFiles } from "./list-files";
import { grep as _grep } from "./grep";
import { bashRunner as _bashRunner } from "./bash-runner";
import { editFile as _editFile } from "./edit-file";
import { multiEdit as _multiEdit } from "./multi-edit";
import { searchAndReplace as _searchAndReplace } from "./search-and-replace";
import { gitStatus as _gitStatus, gitDiff as _gitDiff } from "./git-tools";
import { todoWrite as _todoWrite, task as _task } from "./agent-tools";
import { copyFile as _copyFile, moveFile as _moveFile, deleteFile as _deleteFile, createDirectory as _createDirectory, compress as _compress, extract as _extract } from "./file-management";
import { rebuildInit as _rebuildInit, captureSite as _captureSite, extractDesignTokens as _extractDesignTokens, extractComponentMap as _extractComponentMap, harvestAssets as _harvestAssets, generateCode as _generateCode, visualDiff as _visualDiff, autoFixPass as _autoFixPass, rebuildFinalize as _rebuildFinalize } from "./rebuild-tools";
import { webSearch as _webSearch } from "./web-search";
import { webFetch as _webFetch } from "./web-fetch";
import { fetchUrl as _fetchUrl } from "./fetch";

// Tool registry for ToolExecutor
export const TOOL_REGISTRY = {
  // Core tools
  read_file: _readFile,
  write_file: _writeFile,
  list_files: _listFiles,
  grep: _grep,
  bash: _bashRunner,
  edit_file: _editFile,
  multi_edit: _multiEdit,
  search_and_replace: _searchAndReplace,

  // Git tools
  git_status: _gitStatus,
  git_diff: _gitDiff,

  // Agent tools
  todo_write: _todoWrite,
  task: _task,

  // File management
  copy_file: _copyFile,
  move_file: _moveFile,
  delete_file: _deleteFile,
  create_directory: _createDirectory,
  compress: _compress,
  extract: _extract,

  // Rebuild tools
  rebuild_init: _rebuildInit,
  capture_site: _captureSite,
  extract_design_tokens: _extractDesignTokens,
  extract_component_map: _extractComponentMap,
  harvest_assets: _harvestAssets,
  generate_code: _generateCode,
  visual_diff: _visualDiff,
  auto_fix_pass: _autoFixPass,
  rebuild_finalize: _rebuildFinalize,

  // Web tools (FREE - no API costs)
  web_search: _webSearch,
  web_fetch: _webFetch,
  fetch: _fetchUrl,
} as const;

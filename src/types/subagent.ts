/**
 * SubAgent Types
 * Ported from src/codin/agent/subagent.py
 */

/**
 * SubAgent Task Type enum - matches Python SubAgentTaskType
 */
export enum SubAgentTaskType {
  SUMMARIZE = "summarize",
  BRAINSTORM = "brainstorm",
  PLAN = "plan",
  ANALYZE = "analyze",
  IDEATE = "ideate",
}

/**
 * SubAgent Result interface - matches Python SubAgentResult dataclass
 */
export interface SubAgentResult {
  task: string;
  result: string;
  success: boolean;
  error?: string;
  token_usage?: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * SubAgent interface - matches Python SubAgent class
 */
export interface SubAgent {
  llm_config: import("./llm.js").LLMConfig;
  task: string;
  context?: string;
  task_type: SubAgentTaskType;
  execute(): Promise<SubAgentResult>;
}

/**
 * SubAgent Manager interface - matches Python SubAgentManager class
 */
export interface SubAgentManager {
  llm_config: import("./llm.js").LLMConfig;
  execute_task(
    task: string,
    context?: string,
    task_type?: SubAgentTaskType
  ): Promise<SubAgentResult>;
  get_history(): SubAgentResult[];
  clear_history(): void;
}

/**
 * Re-export LLMConfig for convenience
 */
export type { LLMConfig } from "./llm";

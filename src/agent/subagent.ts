/**
 * SubAgent
 * Ported from src/codin/agent/subagent.py
 */

import { LLMGateway, LLMConfig } from "./llm-gateway";
import type { SubAgentResult } from "../types/subagent.js";
import { SubAgentTaskType } from "../types/subagent.js";
import type { Message } from "../types/agent.js";
import { MessageRole } from "../types/agent.js";

/**
 * SubAgent class
 * Ephemeral sub-agent for one-shot tasks
 */
export class SubAgent {
  llmGateway: LLMGateway;
  task: string;
  context?: string;
  taskType: SubAgentTaskType;
  private used: boolean = false;

  constructor(
    llmGateway: LLMGateway,
    task: string,
    context?: string,
    taskType?: SubAgentTaskType
  ) {
    this.llmGateway = llmGateway;
    this.task = task;
    this.context = context;
    this.taskType = taskType || this._inferTaskType(task);
  }

  /**
   * Infer task type from description
   */
  private _inferTaskType(task: string): SubAgentTaskType {
    const taskLower = task.toLowerCase();

    if (
      ["summarize", "summary", "overview"].some((word) =>
        taskLower.includes(word)
      )
    ) {
      return SubAgentTaskType.SUMMARIZE;
    } else if (
      ["brainstorm", "ideas", "suggestions"].some((word) =>
        taskLower.includes(word)
      )
    ) {
      return SubAgentTaskType.BRAINSTORM;
    } else if (
      ["plan", "strategy", "approach"].some((word) =>
        taskLower.includes(word)
      )
    ) {
      return SubAgentTaskType.PLAN;
    } else if (
      ["analyze", "analysis", "evaluate"].some((word) =>
        taskLower.includes(word)
      )
    ) {
      return SubAgentTaskType.ANALYZE;
    } else if (
      ["ideate", "generate", "create ideas"].some((word) =>
        taskLower.includes(word)
      )
    ) {
      return SubAgentTaskType.IDEATE;
    } else {
      return SubAgentTaskType.ANALYZE;
    }
  }

  /**
   * Build system prompt for sub-agent based on task type
   */
  private _buildSystemPrompt(): string {
    const basePrompt = `You are a specialized sub-agent helping with a specific task.

IMPORTANT CONSTRAINTS:
- You have NO access to tools
- You have NO access to files
- You cannot execute code
- You cannot make changes
- This is a ONE-SHOT execution - you will not be called again
- You must provide a complete answer based only on the context provided

Your role is to provide analysis, ideas, or planning based on information given to you.
Return your response as clear, structured text.`;

    const taskSpecific: Record<SubAgentTaskType, string> = {
      [SubAgentTaskType.SUMMARIZE]: `
Your task: Summarize and condense the provided information.
- Extract key points
- Identify main themes
- Provide a concise overview
- Focus on what's most important`,
      [SubAgentTaskType.BRAINSTORM]: `
Your task: Brainstorm ideas and suggestions.
- Generate multiple options
- Think creatively
- Consider different approaches
- Provide diverse perspectives`,
      [SubAgentTaskType.PLAN]: `
Your task: Create a plan or strategy.
- Break down task into steps
- Identify dependencies
- Suggest an execution order
- Consider potential challenges`,
      [SubAgentTaskType.ANALYZE]: `
Your task: Analyze the provided information.
- Identify patterns
- Find relationships
- Highlight important details
- Provide insights`,
      [SubAgentTaskType.IDEATE]: `
Your task: Generate ideas and suggestions.
- Think creatively
- Propose multiple solutions
- Consider edge cases
- Provide actionable ideas`,
    };

    return basePrompt + (taskSpecific[this.taskType] || "");
  }

  /**
   * Execute the sub-agent task
   * One-shot execution - cannot be called again
   */
  async execute(): Promise<SubAgentResult> {
    if (this.used) {
      return {
        task: this.task,
        result: "",
        success: false,
        error: "Sub-agent already executed. Sub-agents are one-shot only.",
      };
    }

    this.used = true;

    try {
      // Build messages
      const messages: Message[] = [];

      // Add context if provided
      if (this.context) {
        const contextMsg: Message = {
          role: MessageRole.SYSTEM,
          content: `Context:\n${this.context}`,
        };
        messages.push(contextMsg);
      }

      // Add task message
      const taskMsg: Message = {
        role: MessageRole.USER,
        content: this.task,
      };
      messages.push(taskMsg);

      // Get system prompt
      const systemPrompt = this._buildSystemPrompt();

      // Call LLM - NO TOOLS
      const response = await this.llmGateway.call(messages, [], systemPrompt);

      // Extract result
      const resultText = response.content || "";

      // Estimate token usage (actual would come from API)
      const inputTokens = this.context
        ? Math.ceil((this.context.length + this.task.length) / 4)
        : Math.ceil(this.task.length / 4);
      const outputTokens = Math.ceil(resultText.length / 4);

      return {
        task: this.task,
        result: resultText,
        success: true,
        token_usage: {
          input: inputTokens,
          output: outputTokens,
          total: inputTokens + outputTokens,
        },
      };
    } catch (error) {
      return {
        task: this.task,
        result: "",
        success: false,
        error: (error as Error).message,
      };
    }
  }
}

/**
 * SubAgent Manager class
 * Manages sub-agent creation and execution
 */
export class SubAgentManager {
  llmConfig: LLMConfig;
  private executionHistory: SubAgentResult[] = [];

  constructor(llmConfig: LLMConfig) {
    this.llmConfig = llmConfig;
  }

  /**
   * Execute a sub-agent task
   */
  async executeTask(
    task: string,
    context?: string,
    taskType?: SubAgentTaskType
  ): Promise<SubAgentResult> {
    // Create a new LLM gateway for this sub-agent
    const { createLLMGateway } = await import("./llm-gateway.js");
    const llmGateway = createLLMGateway(this.llmConfig);

    // Create sub-agent
    const subAgent = new SubAgent(llmGateway, task, context, taskType);

    // Execute (one-shot)
    const result = await subAgent.execute();

    // Store in history
    this.executionHistory.push(result);

    return result;
  }

  /**
   * Get execution history of sub-agents
   */
  getHistory(): SubAgentResult[] {
    return [...this.executionHistory];
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }
}

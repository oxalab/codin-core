/**
 * LLM Gateway
 * Ported from src/codin/agent/llm_gateway.py
 */

import type {
  LLMResponse,
} from "../types/llm.js";
import { LLMProvider } from "../types/llm.js";
import type { LLMConfig } from "../types/llm.js";
import type { Message, ToolCall } from "../types/agent.js";
import { MessageRole } from "../types/agent.js";
import type { ToolDefinition } from "../types/tools.js";

// Re-export LLMConfig type for external use
export type { LLMConfig } from "../types/llm.js";

/**
 * Abstract base class for LLM gateways
 */
export abstract class LLMGateway {
  config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
  }

  abstract call(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<LLMResponse>;

  abstract formatMessagesForProvider(
    messages: Message[]
  ): Record<string, unknown>[];
}

/**
 * Anthropic Claude API Gateway
 */
export class AnthropicGateway extends LLMGateway {
  private client: unknown;

  constructor(config: LLMConfig) {
    super(config);
    try {
      // Dynamic import of anthropic SDK
      const anthropic = require("@anthropic-ai/sdk");
      this.client = new anthropic.Anthropic({
        apiKey: config.api_key,
      });
    } catch {
      throw new Error(
        "anthropic package required. Install with: bun add @anthropic-ai/sdk"
      );
    }
  }

  formatMessagesForProvider(messages: Message[]): Record<string, unknown>[] {
    const formatted: Record<string, unknown>[] = [];

    for (const msg of messages) {
      if (msg.role === MessageRole.SYSTEM) {
        continue;
      }

      const content: Record<string, unknown>[] = [];
      if (msg.content) {
        content.push({
          type: "text",
          text: msg.content,
        });
      }

      if (msg.tool_calls) {
        for (const toolCall of msg.tool_calls) {
          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.arguments,
          });
        }
      }

      if (msg.role === MessageRole.TOOL) {
        const toolContent = [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id || "",
            content: msg.content,
          },
        ];
        formatted.push({
          role: msg.role,
          content: toolContent,
        });
        continue;
      }

      formatted.push({
        role: msg.role,
        content: content.length === 1 ? content[0] : content,
      });
    }

    return formatted;
  }

  async call(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    const formattedMessages = this.formatMessagesForProvider(messages);

    // Convert tools to anthropic format
    const anthropicTools: Record<string, unknown>[] = [];
    for (const tool of tools) {
      anthropicTools.push({
        name: tool.name,
        description: tool.description || "",
        input_schema: tool.parameters || {},
      });
    }

    // @ts-ignore - client is dynamically loaded
    const response = await this.client.messages.create({
      model: this.config.model,
      max_tokens: this.config.max_tokens || 4096,
      system: systemPrompt,
      messages: formattedMessages as any,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });

    // Extract content and tool calls
    let content = "";
    let toolCalls: ToolCall[] | null = null;

    if (response.content) {
      const textParts: string[] = [];
      const toolCallsList: ToolCall[] = [];

      for (const block of response.content) {
        if (block.type === "text") {
          textParts.push(block.text);
        } else if (block.type === "tool_use") {
          toolCallsList.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          });
        }
      }

      content = textParts.join("\n");
      if (toolCallsList.length > 0) {
        toolCalls = toolCallsList;
      }
    }

    return {
      content,
      tool_calls: toolCalls,
      finish_reason: response.stop_reason,
    };
  }
}

/**
 * OpenAI API Gateway
 */
export class OpenAIGateway extends LLMGateway {
  private client: unknown;

  constructor(config: LLMConfig) {
    super(config);
    try {
      // Dynamic import of OpenAI SDK
      const openai = require("openai");
      this.client = new openai.OpenAI({
        apiKey: config.api_key,
        baseURL: config.base_url,
      });
    } catch {
      throw new Error("openai package required. Install with: bun add openai");
    }
  }

  formatMessagesForProvider(messages: Message[]): Record<string, unknown>[] {
    const formatted: Record<string, unknown>[] = [];

    for (const msg of messages) {
      const role = msg.role;

      if (msg.role === MessageRole.TOOL) {
        formatted.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.tool_call_id,
        });
      } else if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Format all tool calls with arguments as JSON string
        const toolCalls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === "string"
              ? tc.arguments
              : JSON.stringify(tc.arguments || {}),
          },
        }));

        formatted.push({
          role,
          content: msg.content || "",
          tool_calls: toolCalls,
        });
      } else {
        formatted.push({
          role,
          content: msg.content || "",
        });
      }
    }

    return formatted;
  }

  async call(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    const formattedMessages = this.formatMessagesForProvider(messages);

    // Add system message
    if (systemPrompt) {
      formattedMessages.unshift({
        role: "system",
        content: systemPrompt,
      });
    }

    // Convert tools to OpenAI format
    const openaiTools: Record<string, unknown>[] | undefined = tools.length
      ? tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description || "",
            parameters: tool.parameters || {},
          },
        }))
      : undefined;

    // @ts-ignore - client is dynamically loaded
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: formattedMessages as any,
      tools: openaiTools as any,
      temperature: this.config.temperature,
      max_tokens: this.config.max_tokens,
    });

    const message = response.choices[0]?.message;
    const content = message?.content || "";
    const toolCalls: ToolCall[] | null = message?.tool_calls
      ? message.tool_calls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments,
        }))
      : null;

    return {
      content,
      tool_calls: toolCalls,
      finish_reason: response.choices[0]?.finish_reason,
    };
  }
}

/**
 * OpenRouter API Gateway (uses OpenAI-compatible format)
 */
export class OpenRouterGateway extends LLMGateway {
  private client: unknown;

  constructor(config: LLMConfig) {
    super(config);
    try {
      // Dynamic import of OpenAI SDK
      const openai = require("openai");
      this.client = new openai.OpenAI({
        apiKey: config.api_key,
        baseURL: "https://openrouter.ai/api/v1",
      });
    } catch {
      throw new Error("openai package required for openrouter");
    }
  }

  formatMessagesForProvider(messages: Message[]): Record<string, unknown>[] {
    // Use same format as OpenAI
    const formatted: Record<string, unknown>[] = [];

    for (const msg of messages) {
      const role = msg.role;

      if (msg.role === MessageRole.TOOL) {
        formatted.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.tool_call_id,
        });
      } else if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Format all tool calls with arguments as JSON string
        const toolCalls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === "string"
              ? tc.arguments
              : JSON.stringify(tc.arguments || {}),
          },
        }));

        formatted.push({
          role,
          content: msg.content || "",
          tool_calls: toolCalls,
        });
      } else {
        formatted.push({
          role,
          content: msg.content || "",
        });
      }
    }

    return formatted;
  }

  async call(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    const formattedMessages = this.formatMessagesForProvider(messages);

    // Add system message
    if (systemPrompt) {
      formattedMessages.unshift({
        role: "system",
        content: systemPrompt,
      });
    }

    // Convert tools to OpenAI format
    const openaiTools: Record<string, unknown>[] | undefined = tools.length
      ? tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description || "",
            parameters: tool.parameters || {},
          },
        }))
      : undefined;

    // Log request size for debugging credit issues
    const messageCount = formattedMessages.length;
    const toolCount = openaiTools?.length || 0;
    const systemPromptLen = systemPrompt?.length || 0;
    console.log(`[OpenRouter] Request: ${messageCount} messages, ${toolCount} tools, system=${systemPromptLen} chars, max_tokens=${this.config.max_tokens}`);

    // @ts-ignore - client is dynamically loaded
    const response = await this.client.chat.completions.create({
      model: this.config.model,
      messages: formattedMessages as any,
      tools: openaiTools as any,
      temperature: this.config.temperature,
      max_tokens: this.config.max_tokens,
    });

    const message = response.choices[0]?.message;
    const content = message?.content || "";
    const toolCalls: ToolCall[] | null = message?.tool_calls
      ? message.tool_calls.map((tc: any) => ({
          id: tc.id,
          name: tc.function.name,
          arguments:
            typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments,
        }))
      : null;

    return {
      content,
      tool_calls: toolCalls,
      finish_reason: response.choices[0]?.finish_reason,
    };
  }
}

/**
 * Z.AI (GLM / Zhipu AI) Gateway (uses OpenAI-compatible format)
 * Supports both /api/paas/v4/ and /api/anthropic endpoints
 */
export class ZAIGateway extends LLMGateway {
  private client: unknown;
  private useAnthropicFormat: boolean;

  constructor(config: LLMConfig) {
    super(config);
    // Detect if using Anthropic-compatible endpoint
    this.useAnthropicFormat = config.base_url?.includes("/anthropic") || false;

    try {
      // Dynamic import of OpenAI SDK (Z.AI is OpenAI-compatible)
      const openai = require("openai");
      this.client = new openai.OpenAI({
        apiKey: config.api_key,
        baseURL: config.base_url || "https://api.z.ai/api/coding/paas/v4",
      });
    } catch {
      throw new Error("openai package required for z.ai. Install with: bun add openai");
    }
  }

  formatMessagesForProvider(messages: Message[]): Record<string, unknown>[] {
    // Use OpenAI-compatible format
    const formatted: Record<string, unknown>[] = [];

    for (const msg of messages) {
      const role = msg.role;

      if (msg.role === MessageRole.TOOL) {
        formatted.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.tool_call_id,
        });
      } else if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Format all tool calls with arguments as JSON string
        const toolCalls = msg.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: {
            name: tc.name,
            arguments: typeof tc.arguments === "string"
              ? tc.arguments
              : JSON.stringify(tc.arguments || {}),
          },
        }));

        formatted.push({
          role,
          content: msg.content || "", // content may be null for tool-only responses
          tool_calls: toolCalls,
        });
      } else {
        formatted.push({
          role,
          content: msg.content || "",
        });
      }
    }

    return formatted;
  }

  async call(
    messages: Message[],
    tools: ToolDefinition[],
    systemPrompt: string
  ): Promise<LLMResponse> {
    const formattedMessages = this.formatMessagesForProvider(messages);

    // Convert tools to OpenAI format
    const openaiTools: Record<string, unknown>[] | undefined =
      tools.length > 0
        ? tools.map((tool) => ({
            type: "function",
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          }))
        : undefined;

    // Add system prompt as first message if provided
    const messagesWithSystem =
      systemPrompt && systemPrompt.length > 0
        ? [{ role: "system", content: systemPrompt }, ...formattedMessages]
        : formattedMessages;

    // Build request params
    const requestParams: Record<string, unknown> = {
      model: this.config.model,
      messages: messagesWithSystem,
      temperature: this.config.temperature,
    };

    // Only add tools if present (some endpoints don't support tools)
    if (openaiTools && openaiTools.length > 0) {
      requestParams.tools = openaiTools;
    }

    // Only add max_tokens if specified
    if (this.config.max_tokens) {
      requestParams.max_tokens = this.config.max_tokens;
    }

    let response: any;
    try {
      // @ts-ignore - client is dynamically loaded
      response = await this.client.chat.completions.create(requestParams as any);
    } catch (apiError: any) {
      // Extract error details from API response (OpenAI SDK error format)
      let errorDetails = "Unknown error";

      // OpenAI SDK wraps errors differently
      if (apiError.error) {
        // SDK v4+ error format
        errorDetails = JSON.stringify({
          message: apiError.error.message,
          type: apiError.error.type,
          code: apiError.error.code,
          param: apiError.error.param,
        }, null, 2);
      } else if (apiError.response) {
        // Raw response format
        const errorData = apiError.response.data || apiError.response;
        errorDetails = JSON.stringify(errorData, null, 2);
      } else if (apiError.message) {
        errorDetails = apiError.message;
      }

      // Log request details for debugging (write to temp file since TUI blocks console)
      try {
        import("node:fs/promises").then(fs =>
          fs.writeFile("D:\\codin\\codin-core\\zai_debug.json", JSON.stringify({
            error: errorDetails,
            requestParams: {
              model: requestParams.model,
              messages: (requestParams.messages as any[])?.slice(-3), // Last 3 messages
              tools: requestParams.tools ? `${(requestParams.tools as any[]).length} tools` : "none",
              temperature: requestParams.temperature,
              max_tokens: requestParams.max_tokens,
            }
          }, null, 2))
        ).catch(() => {});
      } catch {}

      throw new Error(`Z.AI API Error: ${errorDetails}`);
    }

    // Handle response - check for both OpenAI and Anthropic-like formats
    if (!response.choices || response.choices.length === 0) {
      throw new Error(`Z.AI returned empty response. Full response: ${JSON.stringify(response)}`);
    }

    const choice = response.choices[0];
    const message = choice.message;

    // Handle content - could be string or array (Anthropic format) or object with content blocks
    let content = "";
    if (typeof message.content === "string") {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      // Anthropic-style content blocks
      content = message.content
        .map((block: any) => {
          if (block.type === "text") return block.text;
          return "";
        })
        .join("");
    } else if (message.content) {
      content = String(message.content);
    }

    // Handle tool calls
    const toolCalls: ToolCall[] | null = message?.tool_calls
      ? message.tool_calls.map((tc: any) => {
          let args: Record<string, unknown>;
          try {
            args = typeof tc.function.arguments === "string"
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;
          } catch (e) {
            console.error(`[Z.AI] Failed to parse tool arguments:`, tc.function.arguments);
            args = {};
          }

          // Log tool calls for debugging
          try {
            import("node:fs/promises").then(fs =>
              fs.appendFile("D:\\codin\\codin-core\\zai_tool_calls.json", JSON.stringify({
                tool: tc.function.name,
                raw_args: tc.function.arguments,
                parsed_args: args,
                timestamp: new Date().toISOString(),
              }, null, 2) + "\n")
            ).catch(() => {});
          } catch {}

          return {
            id: tc.id,
            name: tc.function.name,
            arguments: args,
          };
        })
      : null;

    return {
      content: content || null,
      tool_calls: toolCalls,
      finish_reason: choice.finish_reason,
    };
  }
}

/**
 * Factory function to create appropriate LLM gateway
 */
export function createLLMGateway(config: LLMConfig): LLMGateway {
  if (config.provider === LLMProvider.ANTHROPIC) {
    return new AnthropicGateway(config);
  } else if (config.provider === LLMProvider.OPENAI) {
    return new OpenAIGateway(config);
  } else if (config.provider === LLMProvider.OPENROUTER) {
    return new OpenRouterGateway(config);
  } else if (config.provider === LLMProvider.ZAI) {
    return new ZAIGateway(config);
  } else {
    throw new Error(`Unsupported LLM provider: ${config.provider}`);
  }
}

# LLM Provider Mapping

## Source

`src/codin/agent/llm_gateway.py`

## Providers

- Anthropic (`AnthropicGateway`)
- OpenAI (`OpenAIGateway`)
- OpenRouter (`OpenRouterGateway`)

## Shared Contract

- Input: `messages`, `tools`, `system_prompt`
- Output: `LLMResponse` with:
  - `content`
  - optional `tool_calls[]` (`id`, `name`, `arguments`)
  - `finish_reason`

## Message Conversion Behavior

- Internal message model is converted per provider.
- Tool messages are represented as provider-specific tool result messages.
- Assistant messages with tool calls include serialized function arguments.

## Migration Requirements

- Preserve current conversion behavior first.
- Keep tool-call argument parsing behavior stable in parity phase.
- Add strict JSON parsing hardening only after parity baseline passes.


import { AiProvider, AiProviderError, postJson } from './AiProvider';
import type { ChatMessage, ToolDefinition, ChatResponse, ToolCall } from '../../../shared/types';

/** OpenRouter backend (OpenAI-compatible chat completions; free models supported). */
export class OpenRouterProvider implements AiProvider {
  readonly id = 'openrouter' as const;
  readonly label = 'OpenRouter';

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  configurationError(): string | null {
    if (!this.apiKey) return 'No OpenRouter API key configured. Add one in Settings (gear icon).';
    if (!this.model) return 'No OpenRouter model configured.';
    return null;
  }

  async complete(prompt: string): Promise<string> {
    const data = await postJson(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/hoanght12/search',
        'X-Title': 'LightSearch',
      },
      {
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1024,
      },
    );
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new AiProviderError('OpenRouter returned an empty response.');
    return text;
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ChatResponse> {
    const openAiMessages = messages.map(m => {
      if (m.role === 'system') {
        return {
          role: 'system',
          content: m.content,
        };
      } else if (m.role === 'user') {
        return {
          role: 'user',
          content: m.content,
        };
      } else if (m.role === 'assistant') {
        const out: any = {
          role: 'assistant',
          content: m.content || null,
        };
        if (m.toolCalls && m.toolCalls.length > 0) {
          out.tool_calls = m.toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: {
              name: tc.name,
              arguments: tc.arguments,
            },
          }));
        }
        return out;
      } else if (m.role === 'tool') {
        let name = '';
        const idx = messages.indexOf(m);
        for (let i = idx - 1; i >= 0; i--) {
          const prev = messages[i];
          if (prev.role === 'assistant' && prev.toolCalls) {
            const found = prev.toolCalls.find(tc => tc.id === m.toolCallId);
            if (found) {
              name = found.name;
              break;
            }
          }
        }
        if (!name) {
          name = m.toolCallId || 'unknown';
        }

        return {
          role: 'tool',
          tool_call_id: m.toolCallId,
          name,
          content: m.content,
        };
      }
      return {
        role: 'user',
        content: m.content,
      };
    });

    const openAiTools = tools && tools.length > 0 ? tools.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })) : undefined;

    const data = await postJson(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        Authorization: `Bearer ${this.apiKey}`,
        'HTTP-Referer': 'https://github.com/hoanght12/search',
        'X-Title': 'LightSearch',
      },
      {
        model: this.model,
        messages: openAiMessages,
        tools: openAiTools,
        temperature: 0.1,
        max_tokens: 4096,
      },
    );

    const choice = data?.choices?.[0];
    const message = choice?.message;
    const content = message?.content || '';
    const rawToolCalls = message?.tool_calls || [];

    const toolCalls: ToolCall[] = rawToolCalls.map((tc: any) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    const done = toolCalls.length === 0;

    return {
      content,
      toolCalls,
      done,
    };
  }
}

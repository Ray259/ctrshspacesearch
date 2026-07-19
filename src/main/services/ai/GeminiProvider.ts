import { AiProvider, AiProviderError, postJson } from './AiProvider';
import type { ChatMessage, ToolDefinition, ChatResponse, ToolCall } from '../../../shared/types';

/** Google Gemini backend via the Generative Language REST API. */
export class GeminiProvider implements AiProvider {
  readonly id = 'gemini' as const;
  readonly label = 'Gemini';

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  configurationError(): string | null {
    if (!this.apiKey) return 'No Gemini API key configured. Add one in Settings (gear icon).';
    if (!this.model) return 'No Gemini model configured.';
    return null;
  }

  async complete(prompt: string): Promise<string> {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    const data = await postJson(url, {}, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    });
    const text = data?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('');
    if (!text) throw new AiProviderError('Gemini returned an empty response.');
    return text;
  }

  async chat(messages: ChatMessage[], tools?: ToolDefinition[]): Promise<ChatResponse> {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(this.model)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const systemMessage = messages.find(m => m.role === 'system');
    const nonSystemMessages = messages.filter(m => m.role !== 'system');

    const contents = nonSystemMessages.map(m => {
      if (m.role === 'user') {
        return {
          role: 'user',
          parts: [{ text: m.content }],
        };
      } else if (m.role === 'assistant') {
        const parts: any[] = [];
        if (m.content) {
          parts.push({ text: m.content });
        }
        if (m.toolCalls && m.toolCalls.length > 0) {
          for (const tc of m.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: JSON.parse(tc.arguments),
              },
            });
          }
        }
        return {
          role: 'model',
          parts,
        };
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
          role: 'function',
          parts: [{
            functionResponse: {
              name,
              response: { result: m.content },
            },
          }],
        };
      }
      return {
        role: 'user',
        parts: [{ text: m.content }],
      };
    });

    const body: any = {
      contents,
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
    };

    if (systemMessage) {
      body.systemInstruction = {
        parts: [{ text: systemMessage.content }],
      };
    }

    if (tools && tools.length > 0) {
      body.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      }];
    }

    const data = await postJson(url, {}, body);
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    const toolCalls: ToolCall[] = [];
    let content = '';

    for (const part of parts) {
      if (part.text) {
        content += part.text;
      }
      if (part.functionCall) {
        const id = `call_${Math.random().toString(36).substring(2, 11)}`;
        toolCalls.push({
          id,
          name: part.functionCall.name,
          arguments: JSON.stringify(part.functionCall.args || {}),
        });
      }
    }

    const done = toolCalls.length === 0;
    return {
      content,
      toolCalls,
      done,
    };
  }
}

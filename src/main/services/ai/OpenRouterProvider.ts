import { AiProvider, AiProviderError, postJson } from './AiProvider';

/** OpenRouter backend (OpenAI-compatible chat completions; free models supported). */
export class OpenRouterProvider implements AiProvider {
  readonly id = 'openrouter' as const;
  readonly label = 'OpenRouter';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
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
}

import { AiProvider, AiProviderError, postJson } from './AiProvider';

/** Google Gemini backend via the Generative Language REST API. */
export class GeminiProvider implements AiProvider {
  readonly id = 'gemini' as const;
  readonly label = 'Gemini';

  constructor(
    private readonly apiKey: string,
    private readonly model: string,
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
}

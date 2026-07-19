import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  AiDebugInfo,
  AiSearchResponse,
  SearchResultItem,
  ChatMessage,
  AgentStep,
} from '../../../../shared/types';
import type { EmbeddingService } from '../../semantic/EmbeddingService';
import type { SettingsStore } from '../../settings/SettingsStore';
import { AiProviderError } from '../AiProvider';
import type { AiProviderFactory } from '../AiProviderFactory';
import { extractJsonObject } from '../prompts';
import { buildAgentSystemPrompt } from '../context/agentPrompts';
import type { AiSearchStrategy } from './AiSearchStrategy';
import type { McpClientManager } from '../../mcp/McpClientManager';

export class ContextSearchStrategy implements AiSearchStrategy {
  constructor(
    private readonly providers: AiProviderFactory,
    private readonly settings: SettingsStore,
    private readonly embedder: EmbeddingService,
    private readonly mcpClient: McpClientManager,
  ) {}

  async search(query: string, onUpdate?: (intent: string) => void): Promise<AiSearchResponse> {
    const trimmed = query.trim();
    if (!trimmed) return { summary: '', plan: null, results: [] };

    const provider = this.providers.create();
    const started = Date.now();
    const agentSteps: AgentStep[] = [];

    const debug: AiDebugInfo = {
      provider: provider.label,
      model: provider.model,
      prompt: '',
      rawResponse: '',
      plan: null,
      durationMs: 0,
      semantic: {
        available: this.embedder.available,
        indexedCount: 0,
        queryEmbedded: false,
        hitCount: 0,
      },
      agentSteps,
      stepsUsed: 0,
    };

    const finish = <T extends AiSearchResponse>(response: T): T => {
      debug.durationMs = Date.now() - started;
      return response;
    };

    const configError = provider.configurationError();
    if (configError) return finish({ summary: '', plan: null, results: [], error: configError, debug });

    let tools;
    try {
      tools = await this.mcpClient.listTools();
    } catch (err) {
      return finish({
        summary: '',
        plan: null,
        results: [],
        error: `Failed to initialize MCP client: ${(err as Error).message}`,
        debug,
      });
    }

    const messages: ChatMessage[] = [
      { role: 'system', content: buildAgentSystemPrompt() },
      { role: 'user', content: trimmed },
    ];

    debug.prompt = messages.map(m => `[${m.role}] ${m.content}`).join('\n\n');

    const maxSteps = this.settings.get().agenticMaxSteps;
    let finalContent = '';
    let stepsUsed = 0;

    for (let step = 0; step < maxSteps; step++) {
      stepsUsed++;
      if (onUpdate) {
        onUpdate(`Thinking (Step ${step + 1} of ${maxSteps})…`);
      }
      let response;
      try {
        response = await provider.chat(messages, tools);
      } catch (err) {
        const msg = err instanceof AiProviderError ? err.message : String(err);
        return finish({
          summary: '',
          plan: null,
          results: [],
          error: `AI provider error at step ${step + 1}: ${msg}`,
          debug,
        });
      }

      agentSteps.push({
        role: 'assistant',
        content: response.content,
        toolName: response.toolCalls.map(tc => tc.name).join(', ') || undefined,
        toolArgs: response.toolCalls.map(tc => tc.arguments).join('\n') || undefined,
      });

      debug.rawResponse = response.content || JSON.stringify(response.toolCalls);

      if (response.done || response.toolCalls.length === 0) {
        finalContent = response.content;
        break;
      }

      messages.push({
        role: 'assistant',
        content: response.content,
        toolCalls: response.toolCalls,
      });

      for (const call of response.toolCalls) {
        if (onUpdate) {
          onUpdate(`Executing: ${call.name}…`);
        }
        let result: string;
        try {
          result = await this.mcpClient.callTool(
            call.name,
            JSON.parse(call.arguments),
          );
        } catch (err) {
          result = `Error executing tool ${call.name}: ${(err as Error).message}`;
        }

        messages.push({
          role: 'tool',
          content: result,
          toolCallId: call.id,
        });

        agentSteps.push({
          role: 'tool',
          content: result,
          toolName: call.name,
        });
      }
    }

    debug.stepsUsed = stepsUsed;

    if (!finalContent) {
      if (onUpdate) {
        onUpdate('Finalizing results…');
      }
      messages.push({
        role: 'system',
        content: 'You have reached the maximum step limit. Respond now with ONLY your final JSON object matching the required schema, using the information gathered so far.',
      });
      try {
        const response = await provider.chat(messages);
        finalContent = response.content;
        debug.rawResponse = response.content;
      } catch (err) {
        // Fallback
      }
    }

    if (!finalContent) {
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant' && messages[i].content) {
          finalContent = messages[i].content;
          break;
        }
      }
    }

    let responseObj: any;
    try {
      responseObj = extractJsonObject(finalContent);
    } catch (err) {
      return finish({
        summary: '',
        plan: null,
        results: [],
        error: `Agent did not return a final JSON answer. Last content: ${finalContent || '(none)'}. Error: ${err instanceof Error ? err.message : String(err)}`,
        debug,
      });
    }

    const summary = typeof responseObj?.summary === 'string' ? responseObj.summary : 'Agentic MCP Search';
    const insight = typeof responseObj?.insight === 'string' ? responseObj.insight : '';
    const selectedPaths = Array.isArray(responseObj?.selectedPaths) ? responseObj.selectedPaths : [];

    const results: SearchResultItem[] = [];
    let score = 100;
    for (const rawPath of selectedPaths) {
      if (typeof rawPath !== 'string') continue;
      const normalizedPath = path.normalize(rawPath);

      try {
        if (fs.existsSync(normalizedPath)) {
          const stats = fs.statSync(normalizedPath);
          const isDir = stats.isDirectory();
          const name = path.basename(normalizedPath);
          const dir = path.dirname(normalizedPath);
          const isApp = normalizedPath.endsWith('.app') || dir.toLowerCase().includes('applications');

          results.push({
            path: normalizedPath,
            name,
            dir,
            isDir,
            size: stats.size,
            mtimeMs: stats.mtimeMs,
            score,
            kind: isApp ? 'app' : 'file',
            matchedBy: 'name',
          });
          score = Math.max(1, score - 1);
        }
      } catch (err) {
        // Ignored
      }
    }

    const plan = {
      summary,
      insight,
      keywords: [],
      extensions: [],
      contentTerms: [],
      pathHints: [],
      modifiedAfter: null,
      modifiedBefore: null,
    };
    debug.plan = plan;

    return finish({ summary, plan, results, debug });
  }
}

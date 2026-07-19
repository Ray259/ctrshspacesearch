import type { AiSearchResponse } from '../../../shared/types';

export class DebugPanel {
  private lastResponse: AiSearchResponse | null = null;

  constructor(
    private readonly panel: HTMLDivElement,
    private readonly onFocusInput: () => void,
  ) {
    document.addEventListener('keydown', (event) => this.handleKeydown(event));
  }

  get visible(): boolean {
    return !this.panel.classList.contains('hidden');
  }

  open(response: AiSearchResponse | null): void {
    this.lastResponse = response;
    this.panel.replaceChildren(...this.buildContent());
    this.panel.classList.remove('hidden');
  }

  close(): void {
    this.panel.classList.add('hidden');
    this.onFocusInput();
  }

  toggle(response: AiSearchResponse | null): void {
    if (this.visible) {
      this.close();
    } else {
      this.open(response);
    }
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!this.visible) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
      return;
    }

    if (
      event.key === 'c' ||
      event.key === 'C' ||
      ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c')
    ) {
      event.preventDefault();
      this.copyToClipboard();
    }
  }

  private buildContent(): HTMLElement[] {
    const nodes: HTMLElement[] = [debugTitle('AI debug (Press C to Copy)')];
    const response = this.lastResponse;
    if (!response) {
      nodes.push(debugSection('Status', 'No AI request in this session yet. Run an AI search, then press ⌘D again.'));
      return nodes;
    }
    const d = response.debug;
    if (d) {
      nodes.push(
        debugSection('Request', `${d.provider} · ${d.model} · ${d.durationMs} ms`),
        debugSection('Prompt sent', d.prompt || '(not built — provider unconfigured)'),
        debugSection('Raw model response', d.rawResponse || '(no response)'),
        debugSection('Normalized plan (executed locally)', d.plan ? JSON.stringify(d.plan, null, 2) : '(no plan)')
      );

      if (d.agentSteps && d.agentSteps.length > 0) {
        nodes.push(
          debugSection('Agent Execution Steps', `Steps Used: ${d.stepsUsed || 0}\n\n${formatAgentSteps(d.agentSteps)}`)
        );
      }

      nodes.push(
        debugSection(
          'Semantic matching',
          [
            `available: ${d.semantic.available}`,
            `indexed with embeddings: ${d.semantic.indexedCount}`,
            `query embedded in time: ${d.semantic.queryEmbedded}`,
            `similarity hits (this query): ${d.semantic.hitCount}`,
          ].join('\n')
        )
      );
    }
    if (response.error) nodes.push(debugSection('Error', response.error));
    nodes.push(debugSection('Results', `${response.results.length} item(s) after local execution`));
    return nodes;
  }

  private copyToClipboard(): void {
    const response = this.lastResponse;
    if (!response) return;
    const d = response.debug;
    if (!d) return;

    let text = `AI Debug Logs:\n`;
    text += `Request: ${d.provider} · ${d.model} · ${d.durationMs} ms\n\n`;
    text += `Prompt Sent:\n${d.prompt || '(none)'}\n\n`;
    text += `Raw Model Response:\n${d.rawResponse || '(none)'}\n\n`;
    text += `Normalized Plan:\n${d.plan ? JSON.stringify(d.plan, null, 2) : '(none)'}\n\n`;
    
    if (d.agentSteps && d.agentSteps.length > 0) {
      text += `Agent Steps:\n`;
      text += formatAgentSteps(d.agentSteps) + '\n\n';
    }

    text += `Semantic Matching:\n`;
    text += `  available: ${d.semantic.available}\n`;
    text += `  indexed with embeddings: ${d.semantic.indexedCount}\n`;
    text += `  query embedded in time: ${d.semantic.queryEmbedded}\n`;
    text += `  similarity hits (this query): ${d.semantic.hitCount}\n\n`;

    if (response.error) {
      text += `Error: ${response.error}\n\n`;
    }
    text += `Results: ${response.results.length} items.\n`;

    void navigator.clipboard.writeText(text);

    const originalTitle = this.panel.querySelector('.debug-title');
    if (originalTitle) {
      const prevText = originalTitle.textContent;
      originalTitle.textContent = 'Copied to clipboard!';
      setTimeout(() => {
        originalTitle.textContent = prevText;
      }, 1500);
    }
  }
}

function debugTitle(text: string): HTMLElement {
  const h = document.createElement('h2');
  h.className = 'debug-title';
  h.textContent = text;
  return h;
}

function debugSection(title: string, content: string): HTMLElement {
  const section = document.createElement('section');
  const h = document.createElement('h3');
  h.textContent = title;
  const pre = document.createElement('pre');
  pre.textContent = content;
  section.append(h, pre);
  return section;
}

function formatAgentSteps(steps: any[]): string {
  return steps.map((step, idx) => {
    const roleLabel = step.role === 'assistant' ? 'Agent' : 'Tool';
    const header = `[Step ${Math.floor(idx / 2) + 1}] ${roleLabel}`;
    let body = '';
    if (step.role === 'assistant') {
      if (step.toolName) {
        body = `Call Tool: ${step.toolName}\nArguments: ${step.toolArgs || ''}`;
      } else {
        body = step.content || '(no content)';
      }
    } else {
      body = `Tool Output (${step.toolName || 'unknown'}):\n${step.content}`;
    }
    return `${header}\n${body}\n`;
  }).join('\n' + '='.repeat(40) + '\n\n');
}

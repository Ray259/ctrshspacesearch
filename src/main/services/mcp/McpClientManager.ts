import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { ListRootsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs';
import type { ToolDefinition } from '../../../shared/types';
import type { SettingsStore } from '../settings/SettingsStore';

const EXPOSED_TOOLS = new Set([
  'list_directory',
  'search_files',
  'read_text_file',
  'get_file_info',
  'directory_tree'
]);

export class McpClientManager {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  constructor(private readonly settings: SettingsStore) {}

  private getAllRoots(): string[] {
    const indexRoots = this.settings.get().indexRoots;
    const appRoots = getAppRoots();
    return Array.from(new Set([...indexRoots, ...appRoots]))
      .map(r => path.resolve(r))
      .filter(r => {
        try {
          return fs.existsSync(r);
        } catch {
          return false;
        }
      });
  }

  /** Spawns the MCP server subprocess if not already running. */
  async ensureRunning(): Promise<void> {
    if (this.client) {
      return;
    }

    const serverPath = require.resolve(
      '@modelcontextprotocol/server-filesystem/dist/index.js'
    );
    const roots = this.getAllRoots();

    this.transport = new StdioClientTransport({
      command: process.execPath,             // Electron binary
      args: [serverPath, ...roots],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });

    this.client = new Client(
      { name: 'lightsearch', version: '0.1.0' },
      {
        capabilities: {
          roots: {
            listChanged: false
          }
        }
      }
    );

    this.client.setRequestHandler(ListRootsRequestSchema, async () => {
      const roots = this.getAllRoots();
      return {
        roots: roots.map(r => ({
          uri: `file://${r}`,
          name: path.basename(r) || 'Root',
        })),
      };
    });

    await this.client.connect(this.transport);
  }

  /** Returns MCP tool definitions, converted to ToolDefinition[]. */
  async listTools(): Promise<ToolDefinition[]> {
    await this.ensureRunning();
    if (!this.client) {
      throw new Error('MCP client is not running');
    }

    const { tools } = await this.client.listTools();
    return tools
      .filter(t => EXPOSED_TOOLS.has(t.name))
      .map(t => ({
        name: t.name,
        description: t.description ?? '',
        parameters: t.inputSchema as Record<string, unknown>,
      }));
  }

  /** Executes an MCP tool call and returns the text result. */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    await this.ensureRunning();
    if (!this.client) {
      throw new Error('MCP client is not running');
    }

    if (!EXPOSED_TOOLS.has(name)) {
      throw new Error(`Tool ${name} is not allowed or exposed`);
    }

    const response = await this.client.callTool({
      name,
      arguments: args,
    });

    if (response && Array.isArray(response.content)) {
      return response.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
        .join('\n');
    }

    return '';
  }

  /** Terminates the subprocess. Called on app quit. */
  stop(): void {
    if (this.transport) {
      try {
        this.transport.close();
      } catch (err) {
        console.error('Failed to close MCP transport:', err);
      }
      this.transport = null;
    }
    this.client = null;
  }
}

function getAppRoots(): string[] {
  switch (process.platform) {
    case 'darwin':
      return ['/Applications', '/System/Applications', path.join(os.homedir(), 'Applications')];
    case 'win32': {
      const roots: string[] = [];
      if (process.env.ProgramData) {
        roots.push(path.join(process.env.ProgramData, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
      }
      if (process.env.APPDATA) {
        roots.push(path.join(process.env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs'));
      }
      return roots;
    }
    default:
      return ['/usr/share/applications', path.join(os.homedir(), '.local/share/applications')];
  }
}

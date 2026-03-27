/**
 * @nexus/mcp — MCP Discovery
 *
 * Descobre e gerencia MCP servers disponíveis via configuração.
 * Conecta automaticamente e registra tools descobertos.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { MCPClient } from "./mcp-client.js";
import type { MCPServerConfig, MCPTool } from "./mcp-client.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DiscoveredServer {
  config: MCPServerConfig;
  client: MCPClient;
  tools: MCPTool[];
  status: "connected" | "disconnected" | "error";
  error?: string;
}

export interface DiscoveryConfig {
  /** Se deve conectar automaticamente ao registrar — default true */
  autoConnect: boolean;
  /** Timeout por server (ms) — default 10000 */
  connectionTimeout: number;
}

// ═══════════════════════════════════════════════════════════════
// MCP DISCOVERY
// ═══════════════════════════════════════════════════════════════

/**
 * Descobre e gerencia MCP servers.
 *
 * @example
 * ```ts
 * const discovery = new MCPDiscovery();
 * await discovery.register({
 *   id: "github",
 *   name: "GitHub MCP",
 *   transport: "stdio",
 *   command: "npx",
 *   args: ["@modelcontextprotocol/server-github"]
 * });
 *
 * const allTools = discovery.getAllTools();
 * // [{ server: "github", tool: { name: "get_issues", ... } }]
 * ```
 */
export class MCPDiscovery {
  private servers = new Map<string, DiscoveredServer>();
  private config: DiscoveryConfig;

  constructor(config?: Partial<DiscoveryConfig>) {
    this.config = {
      autoConnect: config?.autoConnect ?? true,
      connectionTimeout: config?.connectionTimeout ?? 10000,
    };
  }

  /**
   * Registra e conecta a um MCP server.
   */
  async register(serverConfig: MCPServerConfig): Promise<DiscoveredServer> {
    const client = new MCPClient(serverConfig, {
      timeout: this.config.connectionTimeout,
    });

    const discovered: DiscoveredServer = {
      config: serverConfig,
      client,
      tools: [],
      status: "disconnected",
    };

    if (this.config.autoConnect) {
      try {
        await client.connect();
        const tools = await client.listTools();
        discovered.tools = tools;
        discovered.status = "connected";
      } catch (err) {
        discovered.status = "error";
        discovered.error = (err as Error).message;
      }
    }

    this.servers.set(serverConfig.id, discovered);
    return discovered;
  }

  /**
   * Registra múltiplos servers de uma vez.
   */
  async registerAll(configs: MCPServerConfig[]): Promise<DiscoveredServer[]> {
    const results = await Promise.allSettled(
      configs.map((c) => this.register(c)),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<DiscoveredServer> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  /**
   * Retorna todas as tools de todos os servers conectados.
   */
  getAllTools(): Array<{ serverId: string; serverName: string; tool: MCPTool }> {
    const allTools: Array<{ serverId: string; serverName: string; tool: MCPTool }> = [];

    for (const [, server] of this.servers) {
      if (server.status === "connected") {
        for (const tool of server.tools) {
          allTools.push({
            serverId: server.config.id,
            serverName: server.config.name,
            tool,
          });
        }
      }
    }

    return allTools;
  }

  /**
   * Busca uma tool por nome em todos os servers.
   */
  findTool(name: string): { serverId: string; client: MCPClient; tool: MCPTool } | undefined {
    for (const [, server] of this.servers) {
      if (server.status !== "connected") continue;
      const tool = server.tools.find((t) => t.name === name);
      if (tool) {
        return { serverId: server.config.id, client: server.client, tool };
      }
    }
    return undefined;
  }

  /**
   * Executa uma tool por nome (descobre server automaticamente).
   */
  async executeTool(name: string, args: Record<string, unknown> = {}): Promise<{ serverId: string; result: unknown } | undefined> {
    const found = this.findTool(name);
    if (!found) return undefined;

    const result = await found.client.callTool(name, args);
    return { serverId: found.serverId, result };
  }

  /**
   * Desconecta todos os servers.
   */
  async disconnectAll(): Promise<void> {
    for (const [, server] of this.servers) {
      await server.client.disconnect();
      server.status = "disconnected";
    }
  }

  /** Número de servers registrados */
  get serverCount(): number {
    return this.servers.size;
  }

  /** Servers conectados */
  get connectedServers(): string[] {
    return [...this.servers.entries()]
      .filter(([, s]) => s.status === "connected")
      .map(([id]) => id);
  }

  /** Retorna um server pelo ID */
  getServer(id: string): DiscoveredServer | undefined {
    return this.servers.get(id);
  }
}

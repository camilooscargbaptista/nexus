/**
 * @nexus/bridge — MCP Tool Bridge
 *
 * Adapta MCP tools para o formato SkillDescriptor do Nexus registry.
 * Permite que tools de MCP servers externos sejam usados
 * como skills nativos do Nexus.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MCPToolInfo {
  name: string;
  description: string;
  serverId: string;
  serverName: string;
  inputSchema: Record<string, unknown>;
}

export interface BridgedSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  source: "mcp";
  serverId: string;
  toolName: string;
  triggers: string[];
}

export interface BridgeConfig {
  /** Prefixo para IDs dos skills bridgeados — default "mcp:" */
  idPrefix: string;
  /** Categoria padrão — default "external" */
  defaultCategory: string;
  /** Gera triggers a partir da description */
  autoTriggers: boolean;
}

// ═══════════════════════════════════════════════════════════════
// MCP TOOL BRIDGE
// ═══════════════════════════════════════════════════════════════

/**
 * Converte MCP tools em SkillDescriptors do Nexus.
 *
 * @example
 * ```ts
 * const bridge = new MCPToolBridge();
 * const tools = discovery.getAllTools();
 * const skills = bridge.bridgeAll(tools);
 * // skills = [{ id: "mcp:github:get_issues", name: "get_issues", ... }]
 * ```
 */
export class MCPToolBridge {
  private config: BridgeConfig;
  private bridged = new Map<string, BridgedSkill>();

  constructor(config?: Partial<BridgeConfig>) {
    this.config = {
      idPrefix: config?.idPrefix ?? "mcp:",
      defaultCategory: config?.defaultCategory ?? "external",
      autoTriggers: config?.autoTriggers ?? true,
    };
  }

  /**
   * Converte uma MCP tool em BridgedSkill.
   */
  bridge(tool: MCPToolInfo): BridgedSkill {
    const id = `${this.config.idPrefix}${tool.serverId}:${tool.name}`;

    const skill: BridgedSkill = {
      id,
      name: tool.name,
      description: tool.description,
      category: this.inferCategory(tool),
      source: "mcp",
      serverId: tool.serverId,
      toolName: tool.name,
      triggers: this.config.autoTriggers ? this.generateTriggers(tool) : [],
    };

    this.bridged.set(id, skill);
    return skill;
  }

  /**
   * Converte múltiplas MCP tools.
   */
  bridgeAll(tools: MCPToolInfo[]): BridgedSkill[] {
    return tools.map((t) => this.bridge(t));
  }

  /**
   * Retorna todos os skills bridgeados.
   */
  getAll(): BridgedSkill[] {
    return [...this.bridged.values()];
  }

  /**
   * Busca skill bridgeado por tool name.
   */
  findByToolName(name: string): BridgedSkill | undefined {
    return [...this.bridged.values()].find((s) => s.toolName === name);
  }

  /**
   * Busca skills por server ID.
   */
  findByServer(serverId: string): BridgedSkill[] {
    return [...this.bridged.values()].filter((s) => s.serverId === serverId);
  }

  /** Número de skills bridgeados */
  get count(): number {
    return this.bridged.size;
  }

  /**
   * Infere categoria a partir do nome/descrição da tool.
   */
  private inferCategory(tool: MCPToolInfo): string {
    const text = `${tool.name} ${tool.description}`.toLowerCase();

    const categories: Array<[string, string[]]> = [
      ["vcs", ["git", "commit", "branch", "pull request", "issue", "repository"]],
      ["database", ["query", "database", "sql", "table", "schema", "migration"]],
      ["filesystem", ["file", "directory", "read", "write", "path", "folder"]],
      ["api", ["api", "endpoint", "request", "response", "http", "rest"]],
      ["search", ["search", "find", "lookup", "query", "index"]],
    ];

    for (const [cat, keywords] of categories) {
      if (keywords.some((k) => text.includes(k))) return cat;
    }

    return this.config.defaultCategory;
  }

  /**
   * Gera triggers a partir da description da tool.
   */
  private generateTriggers(tool: MCPToolInfo): string[] {
    const words = tool.description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Top 5 unique words as triggers
    const unique = [...new Set(words)].slice(0, 5);
    return [tool.name, ...unique];
  }
}

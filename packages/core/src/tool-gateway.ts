/**
 * @nexus/core — ToolGateway
 *
 * Port do tool_gateway.py para TypeScript.
 * Registro, validação e execução de tools com histórico.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ToolMetadata {
  name: string;
  description: string;
  fn: ToolFunction;
  inputSchema?: ToolSchema;
  outputSchema?: ToolSchema;
}

export interface ToolSchema {
  required?: string[];
  properties?: Record<string, { type: string; description?: string }>;
}

export type ToolFunction = (inputs: Record<string, unknown>) => unknown | Promise<unknown>;

export interface ToolExecutionRecord {
  toolName: string;
  inputs: Record<string, unknown>;
  result: unknown;
  status: "success" | "error";
  error?: string;
  timestamp: string;
  duration: number;
}

// ═══════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════

export class ToolGatewayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolGatewayError";
  }
}

export class ToolNotFoundError extends ToolGatewayError {
  constructor(toolName: string) {
    super(`Tool '${toolName}' not found`);
    this.name = "ToolNotFoundError";
  }
}

export class ToolValidationError extends ToolGatewayError {
  constructor(toolName: string, message: string) {
    super(`Validation failed for tool '${toolName}': ${message}`);
    this.name = "ToolValidationError";
  }
}

export class ToolExecutionError extends ToolGatewayError {
  constructor(toolName: string, cause: string) {
    super(`Execution failed for tool '${toolName}': ${cause}`);
    this.name = "ToolExecutionError";
  }
}

// ═══════════════════════════════════════════════════════════════
// TOOL GATEWAY
// ═══════════════════════════════════════════════════════════════

export class ToolGateway {
  private tools: Map<string, ToolMetadata> = new Map();
  private executionHistory: ToolExecutionRecord[] = [];

  /**
   * Registra um tool.
   */
  registerTool(
    name: string,
    description: string,
    fn: ToolFunction,
    inputSchema?: ToolSchema,
    outputSchema?: ToolSchema,
  ): void {
    this.tools.set(name, { name, description, fn, inputSchema, outputSchema });
  }

  /**
   * Valida inputs contra o schema do tool.
   */
  validateInput(toolName: string, inputs: Record<string, unknown>): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) throw new ToolNotFoundError(toolName);
    if (!tool.inputSchema?.required) return true;

    for (const field of tool.inputSchema.required) {
      if (!(field in inputs)) {
        throw new ToolValidationError(toolName, `Missing required field: '${field}'`);
      }
    }

    return true;
  }

  /**
   * Executa um tool com validação e recording.
   */
  async executeTool(
    toolName: string,
    inputs: Record<string, unknown> = {},
  ): Promise<unknown> {
    const tool = this.tools.get(toolName);
    if (!tool) throw new ToolNotFoundError(toolName);

    // Validate
    this.validateInput(toolName, inputs);

    // Execute
    const start = Date.now();
    try {
      const result = await Promise.resolve(tool.fn(inputs));

      this.executionHistory.push({
        toolName,
        inputs,
        result,
        status: "success",
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
      });

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      this.executionHistory.push({
        toolName,
        inputs,
        result: undefined,
        status: "error",
        error: errorMsg,
        timestamp: new Date().toISOString(),
        duration: Date.now() - start,
      });

      throw new ToolExecutionError(toolName, errorMsg);
    }
  }

  /**
   * Lista todos os tools registrados.
   */
  listTools(): Array<{ name: string; description: string; inputSchema?: ToolSchema }> {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Retorna a descrição de um tool.
   */
  getToolDescription(toolName: string): string {
    const tool = this.tools.get(toolName);
    if (!tool) throw new ToolNotFoundError(toolName);
    return tool.description;
  }

  hasTool(toolName: string): boolean {
    return this.tools.has(toolName);
  }

  getExecutionHistory(): ToolExecutionRecord[] {
    return [...this.executionHistory];
  }

  clearExecutionHistory(): void {
    this.executionHistory = [];
  }
}

/**
 * @nexus/core — ReActAgent
 *
 * Port do react.py para TypeScript.
 * Implementa o loop Think → Act → Observe para raciocínio iterativo.
 * Integrado com LLMProvider para geração de pensamentos e ToolGateway para ações.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type { LLMProvider, LLMMessage, LLMRequestOptions } from "./llm-provider.js";
import type { ToolGateway } from "./tool-gateway.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export enum AgentState {
  IDLE = "idle",
  THINKING = "thinking",
  ACTING = "acting",
  OBSERVING = "observing",
  DONE = "done",
  ERROR = "error",
}

export interface Thought {
  content: string;
  iteration: number;
  timestamp: string;
}

export interface Action {
  toolName: string;
  inputs: Record<string, unknown>;
  iteration: number;
  timestamp: string;
}

export interface Observation {
  result: unknown;
  success: boolean;
  iteration: number;
  timestamp: string;
}

export interface ReActHistory {
  task: string;
  thoughts: Thought[];
  actions: Action[];
  observations: Observation[];
  finalAnswer: string | undefined;
  state: AgentState;
  iterations: number;
}

export interface ReActAgentConfig {
  maxIterations?: number;
  temperature?: number;
  systemPrompt?: string;
  /** Se true, para no primeiro tool call em vez de continuar o loop */
  singleAction?: boolean;
}

// ═══════════════════════════════════════════════════════════════
// REACT AGENT
// ═══════════════════════════════════════════════════════════════

const DEFAULT_SYSTEM_PROMPT = `You are an AI agent that follows the ReAct (Reasoning + Acting) pattern.

For each step:
1. THINK: Reason about what to do next
2. ACT: Choose a tool to execute (format: TOOL: tool_name | INPUTS: {"key": "value"})
3. OBSERVE: Analyze the result

When you have the final answer:
- Start your response with "FINAL ANSWER:" followed by the answer

Available tools will be listed in the context. If no tool is needed, reason and provide the final answer directly.`;

export class ReActAgent {
  private provider: LLMProvider;
  private toolGateway?: ToolGateway;
  private maxIterations: number;
  private temperature: number;
  private systemPrompt: string;
  private singleAction: boolean;

  private state: AgentState = AgentState.IDLE;
  private task = "";
  private thoughts: Thought[] = [];
  private actions: Action[] = [];
  private observations: Observation[] = [];
  private iteration = 0;

  constructor(
    provider: LLMProvider,
    toolGateway?: ToolGateway,
    config: ReActAgentConfig = {},
  ) {
    this.provider = provider;
    this.toolGateway = toolGateway;
    this.maxIterations = config.maxIterations ?? 10;
    this.temperature = config.temperature ?? 0.7;
    this.systemPrompt = config.systemPrompt || DEFAULT_SYSTEM_PROMPT;
    this.singleAction = config.singleAction ?? false;
  }

  /**
   * Executa o loop ReAct para resolver uma task.
   */
  async run(task: string): Promise<string> {
    this.task = task;
    this.state = AgentState.THINKING;
    this.iteration = 0;
    this.thoughts = [];
    this.actions = [];
    this.observations = [];

    while (this.iteration < this.maxIterations) {
      this.iteration++;

      // THINK
      const thought = await this.think();
      if (!thought) {
        this.state = AgentState.ERROR;
        return "Failed to generate thought";
      }

      // Check for final answer
      const finalAnswer = this.extractFinalAnswer(thought.content);
      if (finalAnswer) {
        this.state = AgentState.DONE;
        return finalAnswer;
      }

      // ACT
      const action = this.parseAction(thought.content);
      if (action) {
        this.state = AgentState.ACTING;
        this.actions.push(action);

        // OBSERVE
        this.state = AgentState.OBSERVING;
        const observation = await this.executeAction(action);
        this.observations.push(observation);

        if (this.singleAction) {
          this.state = AgentState.DONE;
          return typeof observation.result === "string"
            ? observation.result
            : JSON.stringify(observation.result);
        }
      }

      this.state = AgentState.THINKING;
    }

    // Max iterations reached
    this.state = AgentState.DONE;
    const lastThought = this.thoughts[this.thoughts.length - 1];
    return lastThought?.content || "Max iterations reached without a final answer";
  }

  /**
   * Gera um pensamento usando o LLM com todo o contexto acumulado.
   */
  async think(): Promise<Thought | null> {
    const messages = this.buildMessages();
    const options: LLMRequestOptions = {
      temperature: this.temperature,
      systemPrompt: this.systemPrompt,
    };

    try {
      const response = await this.provider.chat(messages, options);
      const thought: Thought = {
        content: response.content,
        iteration: this.iteration,
        timestamp: new Date().toISOString(),
      };
      this.thoughts.push(thought);
      return thought;
    } catch (err) {
      return null;
    }
  }

  /**
   * Executa uma ação via ToolGateway.
   */
  async executeAction(action: Action): Promise<Observation> {
    if (!this.toolGateway) {
      return {
        result: `No tool gateway configured. Cannot execute tool '${action.toolName}'.`,
        success: false,
        iteration: this.iteration,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const result = await this.toolGateway.executeTool(action.toolName, action.inputs);
      return {
        result,
        success: true,
        iteration: this.iteration,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      return {
        result: err instanceof Error ? err.message : String(err),
        success: false,
        iteration: this.iteration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Retorna o histórico completo da execução.
   */
  getHistory(): ReActHistory {
    return {
      task: this.task,
      thoughts: [...this.thoughts],
      actions: [...this.actions],
      observations: [...this.observations],
      finalAnswer: this.state === AgentState.DONE
        ? this.extractFinalAnswer(this.thoughts[this.thoughts.length - 1]?.content || "")
        : undefined,
      state: this.state,
      iterations: this.iteration,
    };
  }

  get currentState(): AgentState {
    return this.state;
  }

  // ── Private ──

  private buildMessages(): LLMMessage[] {
    const messages: LLMMessage[] = [];

    // Task description
    let taskContext = `Task: ${this.task}\n`;

    // Available tools
    if (this.toolGateway) {
      const tools = this.toolGateway.listTools();
      if (tools.length > 0) {
        taskContext += "\nAvailable tools:\n";
        for (const tool of tools) {
          taskContext += `- ${tool.name}: ${tool.description}\n`;
          if (tool.inputSchema) {
            taskContext += `  Input schema: ${JSON.stringify(tool.inputSchema)}\n`;
          }
        }
      }
    }

    messages.push({ role: "user", content: taskContext });

    // Previous iterations as conversation
    for (let i = 0; i < this.thoughts.length; i++) {
      const thought = this.thoughts[i]!;
      messages.push({
        role: "assistant",
        content: `[Iteration ${thought.iteration}] THINK: ${thought.content}`,
      });

      const action = this.actions[i];
      const observation = this.observations[i];

      if (action && observation) {
        messages.push({
          role: "user",
          content: `OBSERVATION (${action.toolName}): ${
            typeof observation.result === "string"
              ? observation.result
              : JSON.stringify(observation.result)
          }${!observation.success ? " [FAILED]" : ""}`,
        });
      }
    }

    // Prompt for next iteration (if not first)
    if (this.thoughts.length > 0) {
      messages.push({
        role: "user",
        content: "Continue reasoning. What is your next thought? Use TOOL: ... | INPUTS: {...} to use a tool, or FINAL ANSWER: ... if you have the answer.",
      });
    }

    return messages;
  }

  private parseAction(thought: string): Action | null {
    // Format: TOOL: tool_name | INPUTS: {"key": "value"}
    const toolMatch = thought.match(/TOOL:\s*(\S+)/i);
    if (!toolMatch) return null;

    const toolName = toolMatch[1]!;
    let inputs: Record<string, unknown> = {};

    const inputsMatch = thought.match(/INPUTS:\s*(\{[^}]+\})/i);
    if (inputsMatch) {
      try {
        inputs = JSON.parse(inputsMatch[1]!);
      } catch {
        // Invalid JSON, proceed with empty inputs
      }
    }

    return {
      toolName,
      inputs,
      iteration: this.iteration,
      timestamp: new Date().toISOString(),
    };
  }

  private extractFinalAnswer(thought: string): string | undefined {
    const match = thought.match(/FINAL ANSWER:\s*([\s\S]+)/i);
    return match ? match[1]!.trim() : undefined;
  }
}

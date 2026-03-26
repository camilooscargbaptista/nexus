/**
 * MockProvider — LLMProvider para testes e desenvolvimento local
 *
 * Retorna respostas pré-configuradas sem chamar nenhuma API.
 * Suporta respostas sequenciais, patterns de matching, e tool calls simulados.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { createHash } from "node:crypto";
import type {
  LLMProvider,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
  EmbeddingResponse,
} from "../llm-provider.js";

const EMBEDDING_DIMS = 384;

export interface MockProviderConfig {
  /** Respostas fixas retornadas em sequência. Cicla quando esgota. */
  responses?: string[];

  /** Map de pattern→resposta. Se o último user message contém o pattern, retorna a resposta. */
  patterns?: Record<string, string>;

  /** Tool calls simulados. Se a mensagem contém a key, retorna o tool call. */
  toolCallPatterns?: Record<string, LLMToolCall[]>;

  /** Modelo simulado */
  model?: string;

  /** Simular latência em ms */
  latency?: number;

  /** Simular falha (throw Error) nas primeiras N chamadas */
  failCount?: number;
}

export class MockProvider implements LLMProvider {
  readonly name = "mock";
  readonly model: string;

  private responses: string[];
  private patterns: Record<string, string>;
  private toolCallPatterns: Record<string, LLMToolCall[]>;
  private latency: number;
  private callIndex = 0;
  private failCount: number;
  private failsRemaining: number;

  /** Histórico de todas as chamadas para assertions em testes */
  public callHistory: Array<{
    method: "chat" | "stream" | "embed";
    messages?: LLMMessage[];
    options?: LLMRequestOptions;
    text?: string;
  }> = [];

  constructor(config: MockProviderConfig = {}) {
    this.model = config.model || "mock-model";
    this.responses = config.responses || ["Mock response"];
    this.patterns = config.patterns || {};
    this.toolCallPatterns = config.toolCallPatterns || {};
    this.latency = config.latency || 0;
    this.failCount = config.failCount || 0;
    this.failsRemaining = this.failCount;
  }

  async chat(
    messages: LLMMessage[],
    options: LLMRequestOptions = {},
  ): Promise<LLMResponse> {
    this.callHistory.push({ method: "chat", messages: [...messages], options });

    if (this.latency > 0) {
      await new Promise((r) => setTimeout(r, this.latency));
    }

    if (this.failsRemaining > 0) {
      this.failsRemaining--;
      throw new Error(`Mock failure (${this.failsRemaining} remaining)`);
    }

    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user")?.content || "";

    // Check pattern matches first
    for (const [pattern, response] of Object.entries(this.patterns)) {
      if (lastUserMsg.includes(pattern)) {
        // Check for tool call patterns too
        let toolCalls: LLMToolCall[] | undefined;
        for (const [tcPattern, calls] of Object.entries(this.toolCallPatterns)) {
          if (lastUserMsg.includes(tcPattern)) {
            toolCalls = calls;
            break;
          }
        }

        return {
          content: response,
          toolCalls,
          model: this.model,
          finishReason: toolCalls ? "tool_use" : "stop",
          usage: {
            inputTokens: lastUserMsg.length,
            outputTokens: response.length,
            totalTokens: lastUserMsg.length + response.length,
          },
        };
      }
    }

    // Check tool call patterns without content patterns
    for (const [pattern, calls] of Object.entries(this.toolCallPatterns)) {
      if (lastUserMsg.includes(pattern)) {
        return {
          content: "",
          toolCalls: calls,
          model: this.model,
          finishReason: "tool_use",
          usage: { inputTokens: lastUserMsg.length, outputTokens: 0, totalTokens: lastUserMsg.length },
        };
      }
    }

    // Fall back to sequential responses
    const content = this.responses[this.callIndex % this.responses.length]!;
    this.callIndex++;

    return {
      content,
      model: this.model,
      finishReason: "stop",
      usage: {
        inputTokens: lastUserMsg.length,
        outputTokens: content.length,
        totalTokens: lastUserMsg.length + content.length,
      },
    };
  }

  async *stream(
    messages: LLMMessage[],
    options: LLMRequestOptions = {},
  ): AsyncIterable<LLMStreamChunk> {
    this.callHistory.push({ method: "stream", messages: [...messages], options });

    const response = await this.chat(messages, options);

    // Simula streaming word-by-word
    if (response.content) {
      const words = response.content.split(" ");
      for (const word of words) {
        if (this.latency > 0) {
          await new Promise((r) => setTimeout(r, this.latency / words.length));
        }
        yield { type: "text", content: word + " " };
      }
    }

    if (response.toolCalls) {
      for (const tc of response.toolCalls) {
        yield { type: "tool_call", toolCall: tc };
      }
    }

    yield { type: "done" };
  }

  async embed(text: string): Promise<EmbeddingResponse> {
    this.callHistory.push({ method: "embed", text });

    if (this.latency > 0) {
      await new Promise((r) => setTimeout(r, this.latency));
    }

    // Hash-based deterministic embedding (same text → same vector)
    const hash = createHash("sha256").update(text).digest();
    const embedding: number[] = [];
    for (let i = 0; i < EMBEDDING_DIMS; i++) {
      embedding.push((hash[i % hash.length]! / 255) * 2 - 1);
    }

    return {
      embedding,
      model: this.model,
      usage: { inputTokens: text.length, outputTokens: 0, totalTokens: text.length },
    };
  }

  async healthCheck(): Promise<boolean> {
    return true;
  }

  // ── Test utilities ──────────────────────────────────────────

  /** Reseta o índice de respostas e histórico */
  reset(): void {
    this.callIndex = 0;
    this.callHistory = [];
    this.failsRemaining = this.failCount;
  }

  /** Número total de chamadas feitas */
  get totalCalls(): number {
    return this.callHistory.length;
  }

  /** Última chamada de chat */
  get lastChatCall(): { messages: LLMMessage[]; options?: LLMRequestOptions } | undefined {
    const chatCalls = this.callHistory.filter((c) => c.method === "chat");
    const last = chatCalls[chatCalls.length - 1];
    return last ? { messages: last.messages!, options: last.options } : undefined;
  }
}

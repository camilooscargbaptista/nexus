/**
 * ClaudeProvider — Implementação do LLMProvider para Anthropic Claude
 *
 * Usa a API oficial da Anthropic. Suporta chat, streaming e tool use.
 * Embedding usa hash-based placeholder (Claude não tem embedding nativo).
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { createHash } from "node:crypto";
import type {
  LLMProvider,
  LLMProviderConfig,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
  LLMUsage,
  EmbeddingResponse,
} from "../llm-provider.js";

const DEFAULT_MODEL = "claude-sonnet-4-20250514";
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TIMEOUT = 30_000;
const EMBEDDING_DIMS = 384;

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface AnthropicResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: "end_turn" | "tool_use" | "max_tokens";
  usage: { input_tokens: number; output_tokens: number };
}

export class ClaudeProvider implements LLMProvider {
  readonly name = "claude";
  readonly model: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;

  constructor(config: LLMProviderConfig = {}) {
    this.apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY || "";
    this.model = config.model || DEFAULT_MODEL;
    this.baseUrl = config.baseUrl || "https://api.anthropic.com";
    this.timeout = config.timeout || DEFAULT_TIMEOUT;
    this.maxRetries = config.maxRetries ?? 2;
  }

  async chat(
    messages: LLMMessage[],
    options: LLMRequestOptions = {},
  ): Promise<LLMResponse> {
    const { systemPrompt, anthropicMessages } = this.transformMessages(messages, options);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
      messages: anthropicMessages,
    };

    if (systemPrompt) body.system = systemPrompt;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.stopSequences?.length) body.stop_sequences = options.stopSequences;

    if (options.tools?.length) {
      body.tools = options.tools.map(
        (t): AnthropicTool => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema,
        }),
      );
    }

    const raw = await this.request<AnthropicResponse>("/v1/messages", body);
    return this.transformResponse(raw);
  }

  async *stream(
    messages: LLMMessage[],
    options: LLMRequestOptions = {},
  ): AsyncIterable<LLMStreamChunk> {
    const { systemPrompt, anthropicMessages } = this.transformMessages(messages, options);

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: options.maxTokens || DEFAULT_MAX_TOKENS,
      messages: anthropicMessages,
      stream: true,
    };

    if (systemPrompt) body.system = systemPrompt;
    if (options.temperature !== undefined) body.temperature = options.temperature;

    const response = await this.rawFetch("/v1/messages", body);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Stream not supported");

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") {
            yield { type: "done" };
            return;
          }

          try {
            const event = JSON.parse(data);
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              yield { type: "text", content: event.delta.text };
            } else if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
              yield {
                type: "tool_call",
                toolCall: {
                  id: event.content_block.id,
                  name: event.content_block.name,
                  arguments: {},
                },
              };
            } else if (event.type === "message_stop") {
              yield { type: "done" };
              return;
            }
          } catch {
            // Skip malformed JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: "done" };
  }

  async embed(text: string): Promise<EmbeddingResponse> {
    // Claude não tem embedding API nativa.
    // Usamos hash-based embedding como placeholder.
    // Em produção, substituir por Voyage AI, Cohere, ou OpenAI embeddings.
    const hash = createHash("sha256").update(text).digest();
    const embedding: number[] = [];
    for (let i = 0; i < EMBEDDING_DIMS; i++) {
      embedding.push((hash[i % hash.length]! / 255) * 2 - 1);
    }

    return {
      embedding,
      model: `${this.model}-hash-embedding`,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await this.chat(
        [{ role: "user", content: "ping" }],
        { maxTokens: 5 },
      );
      return true;
    } catch {
      return false;
    }
  }

  // ── Private helpers ──────────────────────────────────────────

  private transformMessages(
    messages: LLMMessage[],
    options: LLMRequestOptions,
  ): { systemPrompt: string | undefined; anthropicMessages: AnthropicMessage[] } {
    let systemPrompt = options.systemPrompt;
    const anthropicMessages: AnthropicMessage[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${msg.content}` : msg.content;
      } else {
        anthropicMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // Anthropic requires alternating user/assistant; merge consecutive same-role messages
    const merged: AnthropicMessage[] = [];
    for (const msg of anthropicMessages) {
      const last = merged[merged.length - 1];
      if (last && last.role === msg.role) {
        last.content = `${last.content as string}\n\n${msg.content as string}`;
      } else {
        merged.push({ ...msg });
      }
    }

    return { systemPrompt, anthropicMessages: merged };
  }

  private transformResponse(raw: AnthropicResponse): LLMResponse {
    let content = "";
    const toolCalls: LLMToolCall[] = [];

    for (const block of raw.content) {
      if (block.type === "text" && block.text) {
        content += block.text;
      } else if (block.type === "tool_use" && block.id && block.name) {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: (block.input as Record<string, unknown>) || {},
        });
      }
    }

    const usage: LLMUsage = {
      inputTokens: raw.usage.input_tokens,
      outputTokens: raw.usage.output_tokens,
      totalTokens: raw.usage.input_tokens + raw.usage.output_tokens,
    };

    const finishReasonMap: Record<string, LLMResponse["finishReason"]> = {
      end_turn: "stop",
      tool_use: "tool_use",
      max_tokens: "length",
    };

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      model: raw.model,
      finishReason: finishReasonMap[raw.stop_reason] || "stop",
    };
  }

  private async request<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await this.rawFetch(path, body);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Claude API error (${response.status}): ${errorText}`);
    }
    return response.json() as Promise<T>;
  }

  private async rawFetch(path: string, body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timer);

        // Retry on 5xx or 429
        if ((response.status >= 500 || response.status === 429) && attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        return response;
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    clearTimeout(timer);
    throw lastError || new Error("All retries exhausted");
  }
}

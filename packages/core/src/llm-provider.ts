/**
 * @camilooscargbaptista/nexus-core — LLM Abstraction Layer
 *
 * Interface genérica que abstrai Claude, GPT, Gemini, Ollama, etc.
 * Qualquer LLM que implementar LLMProvider pode ser plugado no Nexus.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════
// MESSAGE TYPES
// ═══════════════════════════════════════════════════════════════

export type MessageRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: MessageRole;
  content: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════
// RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════

export interface LLMResponse {
  content: string;
  toolCalls?: LLMToolCall[];
  usage?: LLMUsage;
  model: string;
  finishReason: "stop" | "tool_use" | "length" | "error";
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface LLMStreamChunk {
  type: "text" | "tool_call" | "done";
  content?: string;
  toolCall?: LLMToolCall;
}

// ═══════════════════════════════════════════════════════════════
// EMBEDDING TYPES
// ═══════════════════════════════════════════════════════════════

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  usage?: LLMUsage;
}

// ═══════════════════════════════════════════════════════════════
// REQUEST OPTIONS
// ═══════════════════════════════════════════════════════════════

export interface LLMRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stopSequences?: string[];
  tools?: LLMToolDefinition[];
  systemPrompt?: string;
  responseFormat?: "text" | "json";
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER INTERFACE — The contract
// ═══════════════════════════════════════════════════════════════

/**
 * Interface que qualquer LLM provider deve implementar.
 *
 * Uso:
 *   const provider = new ClaudeProvider({ apiKey: "..." });
 *   const response = await provider.chat(messages, options);
 *
 * Para testes:
 *   const provider = new MockProvider({ responses: ["sim", "não"] });
 */
export interface LLMProvider {
  /** Identificador do provider (ex: "claude", "openai", "ollama") */
  readonly name: string;

  /** Modelo padrão usado (ex: "claude-sonnet-4-20250514", "gpt-4o") */
  readonly model: string;

  /**
   * Chat completion — envia mensagens e recebe resposta.
   * Suporta tool use: passe tools nas options e receba toolCalls na response.
   */
  chat(messages: LLMMessage[], options?: LLMRequestOptions): Promise<LLMResponse>;

  /**
   * Streaming chat — retorna async iterator de chunks.
   * Útil para UIs em tempo real e pipelines longos.
   */
  stream(messages: LLMMessage[], options?: LLMRequestOptions): AsyncIterable<LLMStreamChunk>;

  /**
   * Gera embedding vector para um texto.
   * Usado por LongTermMemory para busca semântica.
   */
  embed(text: string): Promise<EmbeddingResponse>;

  /**
   * Verifica se o provider está configurado e acessível.
   * Retorna true se a API key é válida e o modelo está disponível.
   */
  healthCheck(): Promise<boolean>;
}

// ═══════════════════════════════════════════════════════════════
// PROVIDER CONFIG
// ═══════════════════════════════════════════════════════════════

export interface LLMProviderConfig {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

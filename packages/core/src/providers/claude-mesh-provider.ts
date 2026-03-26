/**
 * Claude Mesh Provider — Wraps ClaudeProvider for use in ProviderMesh
 *
 * Creates pre-configured MeshProvider instances for different Claude model tiers:
 *   - Haiku  → fast tier (exploration, quick checks)
 *   - Sonnet → balanced tier (code review, generation)
 *   - Opus   → powerful tier (architecture, security, critical decisions)
 *
 * Also provides a factory for creating custom mesh providers from any LLMProvider.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import { ClaudeProvider } from "./claude-provider.js";
import type { LLMProvider, LLMProviderConfig } from "../llm-provider.js";
import type { MeshProvider, ProviderCapability } from "../provider-mesh.js";

// ═══════════════════════════════════════════════════════════════
// CLAUDE MODEL CONFIGS
// ═══════════════════════════════════════════════════════════════

interface ClaudeModelConfig {
  model: string;
  tier: MeshProvider["tier"];
  maxContextTokens: number;
  costPerMToken: { input: number; output: number };
  capabilities: ProviderCapability[];
}

const CLAUDE_MODELS: Record<string, ClaudeModelConfig> = {
  haiku: {
    model: "claude-haiku-4-5-20251001",
    tier: "fast",
    maxContextTokens: 200_000,
    costPerMToken: { input: 0.80, output: 4.00 },
    capabilities: ["code-review", "research", "long-context"],
  },
  sonnet: {
    model: "claude-sonnet-4-20250514",
    tier: "balanced",
    maxContextTokens: 200_000,
    costPerMToken: { input: 3.00, output: 15.00 },
    capabilities: [
      "code-generation", "code-review", "security-analysis",
      "reasoning", "long-context", "image-understanding",
    ],
  },
  opus: {
    model: "claude-opus-4-20250514",
    tier: "powerful",
    maxContextTokens: 200_000,
    costPerMToken: { input: 15.00, output: 75.00 },
    capabilities: [
      "code-generation", "code-review", "security-analysis",
      "architecture", "research", "reasoning",
      "long-context", "image-understanding",
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
// FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Create a Claude-powered MeshProvider for a specific tier.
 *
 * Usage:
 *   const mesh = new ProviderMesh();
 *   mesh.registerProvider(createClaudeMeshProvider("sonnet", { apiKey: "..." }));
 */
export function createClaudeMeshProvider(
  tier: "haiku" | "sonnet" | "opus",
  config?: LLMProviderConfig,
): MeshProvider {
  const modelConfig = CLAUDE_MODELS[tier]!;

  const provider = new ClaudeProvider({
    ...config,
    model: config?.model ?? modelConfig.model,
  });

  return {
    id: `claude-${tier}`,
    name: `Claude ${tier.charAt(0).toUpperCase() + tier.slice(1)}`,
    provider,
    tier: modelConfig.tier,
    costPerMToken: modelConfig.costPerMToken,
    maxContextTokens: modelConfig.maxContextTokens,
    capabilities: modelConfig.capabilities,
    enabled: true,
  };
}

/**
 * Create all three Claude tiers at once.
 *
 * Usage:
 *   const mesh = new ProviderMesh();
 *   for (const mp of createClaudeMeshProviders({ apiKey: "..." })) {
 *     mesh.registerProvider(mp);
 *   }
 */
export function createClaudeMeshProviders(
  config?: LLMProviderConfig,
): MeshProvider[] {
  return [
    createClaudeMeshProvider("haiku", config),
    createClaudeMeshProvider("sonnet", config),
    createClaudeMeshProvider("opus", config),
  ];
}

/**
 * Create a MeshProvider from any LLMProvider implementation.
 * Useful for plugging in OpenAI, Ollama, Gemini, etc.
 *
 * Usage:
 *   const ollamaProvider = new OllamaProvider({ model: "llama3" });
 *   const meshProvider = createCustomMeshProvider({
 *     id: "ollama-llama3",
 *     name: "Ollama Llama 3",
 *     provider: ollamaProvider,
 *     tier: "fast",
 *     capabilities: ["code-generation", "code-review"],
 *   });
 */
export function createCustomMeshProvider(options: {
  id: string;
  name: string;
  provider: LLMProvider;
  tier: MeshProvider["tier"];
  capabilities: ProviderCapability[];
  costPerMToken?: { input: number; output: number };
  maxContextTokens?: number;
  enabled?: boolean;
}): MeshProvider {
  return {
    id: options.id,
    name: options.name,
    provider: options.provider,
    tier: options.tier,
    costPerMToken: options.costPerMToken ?? { input: 0, output: 0 },
    maxContextTokens: options.maxContextTokens ?? 128_000,
    capabilities: options.capabilities,
    enabled: options.enabled ?? true,
  };
}

// ═══════════════════════════════════════════════════════════════
// MESH SETUP HELPER
// ═══════════════════════════════════════════════════════════════

export interface NexusMeshConfig {
  /** Anthropic API key (or set ANTHROPIC_API_KEY env var) */
  apiKey?: string;
  /** Which tiers to enable. Default: all three */
  tiers?: ("haiku" | "sonnet" | "opus")[];
  /** Custom providers to add alongside Claude */
  customProviders?: MeshProvider[];
}

/**
 * High-level helper: creates a fully configured ProviderMesh
 * with Claude providers and optional custom providers.
 *
 * Usage:
 *   import { ProviderMesh } from "@nexus/core";
 *   import { setupNexusMesh } from "@nexus/core/providers/claude-mesh-provider";
 *
 *   const { mesh, providers } = setupNexusMesh({ apiKey: "sk-..." });
 *   const result = await mesh.dispatch(request);
 */
export function setupNexusMesh(config: NexusMeshConfig = {}): {
  providers: MeshProvider[];
} {
  const tiers = config.tiers ?? ["haiku", "sonnet", "opus"];
  const providerConfig: LLMProviderConfig = { apiKey: config.apiKey };

  const providers: MeshProvider[] = tiers.map((tier) =>
    createClaudeMeshProvider(tier, providerConfig),
  );

  if (config.customProviders) {
    providers.push(...config.customProviders);
  }

  return { providers };
}

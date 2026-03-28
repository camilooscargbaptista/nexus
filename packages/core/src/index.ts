/**
 * @camilooscargbaptista/nexus-core — Core orchestration, LLM abstraction, agents, memory, and fallback
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// LLM Abstraction Layer
export type {
  LLMProvider,
  LLMProviderConfig,
  LLMMessage,
  LLMRequestOptions,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
  LLMToolDefinition,
  LLMUsage,
  EmbeddingResponse,
  MessageRole,
} from "./llm-provider.js";

// Providers
export { ClaudeProvider } from "./providers/claude-provider.js";
export { MockProvider } from "./providers/mock-provider.js";
export type { MockProviderConfig } from "./providers/mock-provider.js";

// Orchestrator
export {
  AgentOrchestrator,
  TaskStatus,
  OrchestrationError,
} from "./orchestrator.js";
export type { Task, Agent, TaskContext } from "./orchestrator.js";

// ReAct Agent
export { ReActAgent, AgentState } from "./react-agent.js";
export type {
  Thought,
  Action,
  Observation,
  ReActHistory,
  ReActAgentConfig,
} from "./react-agent.js";

// Tool Gateway
export {
  ToolGateway,
  ToolGatewayError,
  ToolNotFoundError,
  ToolValidationError,
  ToolExecutionError,
} from "./tool-gateway.js";
export type {
  ToolMetadata,
  ToolSchema,
  ToolFunction,
  ToolExecutionRecord,
} from "./tool-gateway.js";

// Memory
export {
  ShortTermMemory,
  LongTermMemory,
  HybridMemory,
  cosineSimilarity,
} from "./memory.js";
export type { MemoryEntry, EmbeddingEntry, MemoryStore } from "./memory.js";

// Fallback
export {
  FallbackChain,
  FallbackChainError,
  RetryStrategy,
} from "./fallback.js";
export type { FallbackStep, FallbackExecutionRecord } from "./fallback.js";

// Logger
export { ConsoleLogger, NullLogger } from "./logger.js";
export type { Logger } from "./logger.js";

// Feedback Loop Storage
export { FeedbackStore, InMemoryPersistence } from "./feedback-store.js";
export type {
  PipelineRun,
  ScoreSnapshot,
  FindingOutcome,
  FixOutcome,
  TrendQuery,
  TrendResult,
  FeedbackPersistence,
} from "./feedback-store.js";

// Agent Tribunal
export { Tribunal } from "./tribunal.js";
export type {
  AgentRole,
  TribunalFinding,
  AgentVerdict,
  TribunalVerdict,
  ConsensusFinding,
  DisputeFinding,
  TribunalAgent,
  TribunalConfig,
} from "./tribunal.js";

// Model Router
export { ModelRouter, inferTaskProfile } from "./model-router.js";
export type {
  ModelTier,
  TaskProfile,
  TaskType,
  RoutingRule,
  RoutingDecision,
  RoutingStats,
  ModelRouterConfig,
} from "./model-router.js";

// Continuous Learning Engine
export { LearningEngine } from "./learning-engine.js";
export type {
  SkillAdjustment,
  AdjustmentType,
  SuppressionRule,
  PriorityBoost,
  PatternInsight,
  LearningReport,
  LearningConfig,
} from "./learning-engine.js";

// Sprint 8.5 — Octopus Integration Patterns

// Provider Mesh — Multi-LLM orchestration
export { ProviderMesh } from "./provider-mesh.js";
export type {
  MeshProvider,
  ProviderCapability,
  DispatchStrategy,
  ConsensusConfig,
  ContextBudget,
  ProviderRole,
  MeshRequest,
  ProviderResponse,
  ConsensusResult,
  CostRecord,
  CostReport,
} from "./provider-mesh.js";

// Persona System — Agent personas with RBAC
export { PersonaSystem, BUILT_IN_PERSONAS } from "./persona-system.js";
export type {
  Persona,
  ToolPolicy,
  ContextInjection,
  PersonaMatch,
} from "./persona-system.js";

// Session State Machine — Deterministic phase management
export { SessionStateMachine, InMemoryStateStore } from "./session-state.js";
export type {
  SessionPhase,
  SessionSnapshot,
  Decision,
  PhaseTransition,
  StateStore,
} from "./session-state.js";
export type { Observation as SessionObservation } from "./session-state.js";

// Sprint 10 — Wire Everything
export { FileStateStore, TrendTracker } from "./file-state-store.js";
export type { FileStateStoreConfig, TrendPoint, TrendAnalysis } from "./file-state-store.js";
export { createClaudeMeshProvider, createClaudeMeshProviders, createCustomMeshProvider, setupNexusMesh } from "./providers/claude-mesh-provider.js";
export type { NexusMeshConfig } from "./providers/claude-mesh-provider.js";

// Sprint 1 — Resilience Layer

// Resilient HTTP Client
export {
  ResilientHttpClient,
  CircuitBreakerState,
  CircuitBreakerOpenError,
  HttpTimeoutError,
  HttpExhaustedRetriesError,
} from "./resilient-http.js";
export type {
  ResilientHttpConfig,
  HttpRequestOptions,
  ResilientResponse,
  HttpClientMetrics,
} from "./resilient-http.js";

// TTL Cache
export { TTLCache } from "./ttl-cache.js";
export type { TTLCacheConfig, CacheStats } from "./ttl-cache.js";

// Rate Limiter
export { RateLimiter } from "./rate-limiter.js";
export type {
  RateLimiterConfig,
  AcquireResult,
  RateLimiterStats,
} from "./rate-limiter.js";

// Sprint 3 — Batch Executor
export { BatchExecutor } from "./batch-executor.js";
export type {
  BatchTask,
  BatchTaskResult,
  BatchResult,
  BatchConfig,
} from "./batch-executor.js";

// Sprint 4 — Domain-Specific
export {
  validateCPF,
  validateCNPJ,
  validateCEP,
  formatCPF,
  formatCNPJ,
  formatCEP,
} from "./br-validators.js";
export type { ValidationResult } from "./br-validators.js";

export {
  formatTable,
  formatDuration,
  formatScore,
  formatSeverity,
  formatFileList,
  formatDiff,
  formatSection,
} from "./markdown-format.js";

export { QueryPlanner } from "./query-planner.js";
export type {
  PlanStep,
  ExecutionPlan,
  PlannerContext,
} from "./query-planner.js";

// Sprint 5 — Self-Reflection
export { ConstitutionEngine } from "./constitution.js";
export type {
  ConstitutionRule,
  ConstitutionCategory,
  ConstitutionEvaluation,
  EvaluationContext,
  RuleResult,
} from "./constitution.js";

export { ReflectionLoop } from "./self-reflection.js";
export type {
  ContentGenerator,
  ReflectionConfig,
  ReflectionResult,
  ReflectionEvent,
  ReflectionEventEmitter,
} from "./self-reflection.js";

// Sprint 6 — Health Supervisor
export { HealthSupervisor } from "./health-supervisor.js";
export type {
  HealthSignal,
  HealthSnapshot,
  HealthThresholds,
  CodebaseMetrics,
} from "./health-supervisor.js";

export { StressDetector } from "./stress-detector.js";
export type {
  StressIndicator,
  StressReport,
  SourceAnalysis,
} from "./stress-detector.js";

export { HealthReportGenerator } from "./health-report.js";
export type { HealthReportOptions } from "./health-report.js";

// Sprint 9 — Reward Tracker
export { RewardTracker } from "./reward-tracker.js";
export type {
  RewardEntry,
  RewardSummary,
  RewardTrackerConfig,
} from "./reward-tracker.js";

export { FeedbackCollector } from "./feedback-collector.js";
export type {
  FeedbackSource,
  FeedbackEvent,
  FeedbackCollectorConfig,
} from "./feedback-collector.js";

export { RewardReportGenerator } from "./reward-report.js";
export type { RewardReportOptions } from "./reward-report.js";

// Sprint 10 — Context Window Manager
export { TokenEstimator } from "./token-estimator.js";
export type {
  TokenEstimate,
  ModelLimits,
} from "./token-estimator.js";

export { ContextPrioritizer } from "./context-prioritizer.js";
export type {
  ContextChunk,
  ContextWindow,
  ContextPrioritizerConfig,
} from "./context-prioritizer.js";

export { ContextWindowManager } from "./context-window.js";
export type {
  ContextManagerConfig,
  AssembledPrompt,
} from "./context-window.js";

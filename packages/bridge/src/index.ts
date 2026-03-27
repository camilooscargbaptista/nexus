/**
 * @nexus/bridge — The integration layer connecting Architect, CTO Toolkit, and Sentinel
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

export { NexusPipeline } from "./nexus-pipeline.js";
export { ArchitectAdapter } from "./architect-adapter.js";
export { SentinelAdapter } from "./sentinel-adapter.js";
export { ToolkitRouter } from "./toolkit-router.js";

// Sprint 5 — Intelligence Layer
export { SkillComposer, BUILT_IN_PIPELINES } from "./skill-composer.js";
export type {
  SkillStep,
  CompositionPipeline,
  CompositionResult,
  StepResult,
  SkillExecutor,
} from "./skill-composer.js";

export { DriftDetector } from "./drift-detector.js";
export type {
  ADRConstraint,
  ConstraintType,
  ArchConstraint,
  DriftResult,
  DriftViolation,
  ComplianceRecord,
  CodebaseInspector,
} from "./drift-detector.js";

// Sprint 8 — ECC Integration Patterns
export { PipelineHookManager, createTimingHook, createFindingThresholdHook, createScoreGateHook } from "./pipeline-hooks.js";
export type {
  HookPhase,
  HookAction,
  HookDecision,
  HookContext,
  HookHandler,
  HookRegistration,
  HookExecutionRecord,
} from "./pipeline-hooks.js";

export { SkillRegistry, BUILT_IN_SKILLS } from "./skill-registry.js";
export type {
  SkillDescriptor,
  SkillDescriptorCategory,
  SkillTrigger,
  SkillMatch,
  ActivationPlan,
} from "./skill-registry.js";

// Sprint 8.5 — Octopus Integration Patterns

// Intent Router — NLP-based workflow routing
export { IntentRouter, createIntentRouter } from "./intent-router.js";
export type {
  WorkflowFamily,
  ComplexityTier,
  CynefinDomain,
  ResponseMode,
  RoutingRule as IntentRoutingRule,
  RoutingResult,
  IntentContext,
} from "./intent-router.js";

// Dark Factory — Autonomous spec-to-deploy pipeline
export { DarkFactory, assessSpecMaturity, splitHoldout } from "./dark-factory.js";
export type {
  SpecMaturity,
  FactoryPhase,
  FactoryVerdict,
  FactoryConfig,
  SpecAnalysis,
  TestScenario,
  HoldoutSplit,
  HoldoutResult,
  FactoryReport,
  PhaseResult,
  ImplementationEngine,
  EvaluationEngine,
} from "./dark-factory.js";

// Reaction Engine — Event-driven auto-response
export { ReactionEngine, DEFAULT_REACTION_RULES } from "./reaction-engine.js";
export type {
  EventSource,
  EventSeverity,
  ReactionAction,
  SystemEvent,
  ReactionRule,
  ReactionCondition,
  ReactionExecution,
  ReactionStats,
  ActionExecutor,
} from "./reaction-engine.js";

// Sprint 10 — Wire Everything
export { createArchitectBridge, transformReport } from "./architect-bridge.js";
export type { RawArchitectReport, RawArchitectModule, BridgedAnalysisReport } from "./architect-bridge.js";
export { ConsoleExecutor, FileReporterExecutor, WebhookExecutor, CompositeExecutor, createExecutor } from "./action-executors.js";
export type { FileReporterConfig, WebhookConfig, ExecutorFactoryConfig } from "./action-executors.js";

// Sprint 2 — Governance + Discovery
export { SkillMetaSchema, SkillMetaBuilder, validateSkillMeta, parseSkillMeta } from "./skill-meta.js";
export type { SkillMeta, SkillMetaValidationResult, SkillMetaValidationError } from "./skill-meta.js";
export { AutoRegistry } from "./auto-registry.js";
export type { FeatureModule, DiscoveryResult } from "./auto-registry.js";

// Sprint 3 — Intelligence Layer
export { BM25Index, SkillSearchEngine, tokenize } from "./bm25-search.js";
export type { BM25Config, SearchResult, SkillSearchResult } from "./bm25-search.js";
export { LLMRecommender } from "./llm-recommender.js";
export type { LLMProvider, SkillRecommendation, RecommenderConfig } from "./llm-recommender.js";

// Re-export core types for convenience
export type {
  NexusPipelineResult,
  NexusConfig,
  NexusInsight,
  ArchitectureSnapshot,
  GuidanceResult,
  ValidationSnapshot,
} from "@nexus/types";


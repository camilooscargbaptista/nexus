# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-03-26

### Added

#### Core Engine (`@nexus/core`)
- `AgentOrchestrator` with Kahn's algorithm topological sort and cycle detection
- `ProviderMesh` — Multi-LLM orchestration with parallel/sequential/fan-out/round-robin dispatch
- `ModelRouter` — Task-aware LLM selection (Haiku/Sonnet/Opus) with rule-based routing
- `PersonaSystem` — Agent personas with RBAC and built-in personas
- `SessionStateMachine` — Deterministic phase management with state persistence
- `Tribunal` — Multi-agent review board with weighted consensus voting
- `LearningEngine` — Continuous learning with skill adjustments and pattern insights
- `FeedbackStore` — Pipeline run storage with trend analysis
- `ReActAgent` — Thought-Action-Observation loop agent
- `ToolGateway` — Tool registration, validation, and execution tracking
- `HybridMemory` — Short-term + long-term memory with cosine similarity search
- `FallbackChain` — Retry strategies with step-by-step fallback
- Claude Mesh Providers — Pre-configured Haiku/Sonnet/Opus providers

#### Bridge Layer (`@nexus/bridge`)
- `NexusPipeline` — Unified Perception → Reasoning → Validation pipeline
- `ArchitectAdapter` — Transform Architect reports to Nexus format
- `SentinelAdapter` — Transform Sentinel results to Nexus format
- `ToolkitRouter` — Route findings to 24 specialized skills
- `IntentRouter` — NLP-based workflow routing with Cynefin domains
- `DarkFactory` — 7-phase autonomous spec-to-deploy pipeline with holdout testing
- `ReactionEngine` — Event-driven auto-response with severity filtering and cooldowns
- `DriftDetector` — ADR constraint compliance and drift violation detection
- `SkillComposer` — Multi-step skill pipeline composition
- `SkillRegistry` — Skill descriptor matching and activation planning
- `PipelineHookManager` — Before/after hooks with timing, threshold, and score gates
- `ArchitectBridge` — Raw Architect report transformation layer
- Action Executors — Console, File, Webhook, Composite execution

#### Autonomy Layer (`@nexus/autonomy`)
- `RemediationEngine` — Plan→Apply→Verify cycle with sub-agent verification and rollback
- `DebtPrevention` — PR-level debt trajectory analysis with heuristic estimation
- `AEPGenerator` — Architecture Evolution Proposal with roadmap generation

#### Event System (`@nexus/events`)
- `NexusEventBus` — Typed event bus with correlation tracking, filtering, and log

#### Type System (`@nexus/types`)
- 480+ lines of shared interfaces covering all 4 layers
- Temporal and Forecast types for v4.0 predictive analysis
- `NexusConfig` with `DEFAULT_CONFIG`

#### Cloud Backend (`@nexus/cloud`)
- Express API with composition root DI pattern
- JWT authentication middleware
- Audit logging middleware
- Auth, Project, Team services with repository interfaces
- In-memory repository implementations
- Health check routes
- Zod-based configuration validation

#### Dashboard (`@nexus/dashboard`)
- React 18 + Tailwind CSS + Recharts
- 4 pages: Dashboard, Findings, Pipeline, Team
- 20+ components: charts, tables, badges, layouts
- API client with mock data for development

#### MCP Servers (`@nexus/mcp`)
- Perception server (analyze, score, forecast, antiPatterns tools)
- Reasoning server
- Validation server
- stdio transport for Claude Code/Desktop integration

#### CLI (`@nexus/cli`)
- `nexus analyze` — Full pipeline analysis with ANSI output
- `nexus score` — Quick architecture score
- `nexus status` — Last run overview
- `nexus history` — Trend tracking over time
- Local `.nexus/` persistence with up to 100 history entries

#### GitHub App (`@nexus/app`)
- PR analysis webhook handlers

#### Testing
- 909 tests across all packages
- Jest + ts-jest with ESM support
- Mock providers for isolated testing

### Fixed

- `DefaultPipelineLogger.info()` referencing non-existent `this.logger` — now uses `console.info`
- `NexusPipeline.determineTrend()` never returning `"improving"` — fixed thresholds
- Unsafe non-null assertions (`perception!`, `validation!`) replaced with safe defaults
- CLI using non-existent `eventBus.subscribe()` — corrected to `eventBus.on()`

# NEXUS

### Autonomous Engineering Intelligence Platform

> The first AI system that **analyzes**, **reasons about**, and **auto-remediates** architectural problems in your codebase.

[![Tests](https://img.shields.io/badge/tests-1170%20passing-brightgreen)]()
[![Packages](https://img.shields.io/badge/packages-10-blue)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6)]()
[![License](https://img.shields.io/badge/license-BSL%201.1-yellow)](LICENSE)

**[Girardelli Tecnologia](https://girardellitecnologia.com)** — Anthropic Claude Partner Network

---

## What is Nexus?

Nexus is not a linter. It's an **autonomous engineering intelligence platform** that unifies three battle-tested AI tools into a single pipeline:

```
Perception (Architect) → Reasoning (CTO Toolkit) → Validation (Sentinel Method) → Action
```

**SonarQube tells you there's a code smell.** Nexus tells you *why* it exists, *what the business impact is*, and *how to fix it* — then fixes it.

### The Pipeline

1. **Perception** — [Architect](https://github.com/camilooscargbaptista/architect) analyzes your codebase: C4 diagrams, dependency graphs, anti-pattern detection, architecture score (0-100)
2. **Reasoning** — [CTO Toolkit](https://github.com/camilooscargbaptista/cto-toolkit) routes findings to 24 specialized skills via smart context-aware routing
3. **Validation** — [Sentinel Method](https://github.com/camilooscargbaptista/sentinel-method) validates that every fix meets quality, security, and performance standards
4. **Action** — ReactionEngine auto-remediates issues, sends alerts (Slack, webhook), generates reports

---

## Quick Start

```bash
# Install
git clone https://github.com/camilooscargbaptista/nexus.git
cd nexus && npm install

# Run all 1170 tests
npx jest

# CLI (coming soon to npm)
nexus analyze .          # Full codebase analysis
nexus score .            # Quick architecture score
nexus status             # Current health overview
nexus history            # Trend tracking over time
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        NEXUS PLATFORM                        │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐          │
│  │ CLI / CI │  │ Cloud API    │  │ MCP Servers   │          │
│  │ Plugin   │  │ (Express)    │  │ (3 servers)   │   Entry  │
│  └────┬─────┘  └──────┬───────┘  └──────┬────────┘  Points  │
│       └───────────────┬┘────────────────┘                    │
│                       ▼                                      │
│  ┌─────────────────────────────────────────────────┐         │
│  │              NexusPipeline                       │         │
│  │                                                  │         │
│  │  ┌─────────────┐    ┌──────────────┐             │         │
│  │  │  Architect   │───▶│ ToolkitRouter │            │  Core   │
│  │  │  Adapter     │    │ (24 skills)   │            │         │
│  │  └─────────────┘    └──────┬───────┘             │         │
│  │         │                  │                      │         │
│  │         ▼                  ▼                      │         │
│  │  ┌─────────────┐    ┌──────────────┐             │         │
│  │  │  Sentinel   │◀───│ NexusEventBus │            │         │
│  │  │  Adapter    │    └──────────────┘             │         │
│  │  └──────┬──────┘                                 │         │
│  │         ▼                                        │         │
│  │  NexusPipelineResult                             │         │
│  └─────────────────────────────────────────────────┘         │
│                       │                                      │
│                       ▼                                      │
│  ┌─────────────────────────────────────────────────┐         │
│  │           Autonomy + Intelligence Layer           │         │
│  │                                                  │         │
│  │  IntentRouter · PersonaSystem · SessionState     │ Intelligence │
│  │  ReactionEngine · DriftDetector · SkillComposer  │         │
│  │  ProviderMesh · BM25Search · LLMRecommender     │         │
│  │  BatchExecutor · QueryPlanner · MiddlewareChain  │         │
│  └─────────────────────────────────────────────────┘         │
│                       │                                      │
│                       ▼                                      │
│  ┌─────────────────────────────────────────────────┐         │
│  │           Cloud + Dashboard                      │         │
│  │                                                  │  Product│
│  │  REST API · Auth · Team Management               │         │
│  │  React Dashboard · Score Trends · Findings       │         │
│  └─────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────┘
```

---

## Monorepo Packages

| Package | Description | Key Modules |
|---------|-------------|-------------|
| **`@nexus/types`** | Shared type system | LLMProvider, NexusEvent, SystemEvent, Pipeline types |
| **`@nexus/events`** | Event bus | NexusEventBus, **MiddlewareChain**, withLogging, withTiming |
| **`@nexus/core`** | Engine | Orchestrator, ProviderMesh, ModelRouter, PersonaSystem, ToolGateway, SessionState, Tribunal, **ResilientHttpClient**, **TTLCache**, **RateLimiter**, **BatchExecutor**, **QueryPlanner**, **BR Validators** (CPF/CNPJ/CEP), **Markdown Formatting**, **ConstitutionEngine**, **ReflectionLoop**, **HealthSupervisor**, **StressDetector**, **HealthReportGenerator** |
| **`@nexus/bridge`** | Integration layer | ArchitectAdapter, SentinelAdapter, ToolkitRouter, ReactionEngine, NexusPipeline, IntentRouter, DriftDetector, **SkillMeta** (Zod), **AutoRegistry**, **BM25Index**, **SkillSearchEngine**, **LLMRecommender**, **CriticAdapter**, **IntentClassifier**, **RoutingStrategy**, **SupervisorRouter** |
| **`@nexus/autonomy`** | Self-improvement | AEP Generator, Debt Prevention, Remediation |
| **`@nexus/cloud`** | Backend API | Express routes, Auth, Team/Project services, Prisma schema |
| **`@nexus/dashboard`** | Frontend | React 18 + Tailwind + Recharts components (4 pages, 20+ components) |
| **`@nexus/mcp`** | MCP Protocol | Perception, Reasoning, Validation servers, **MCPClient**, **MCPDiscovery** |
| **`@nexus/cli`** | CLI tool | `nexus analyze/score/status/history` with ANSI output |
| **`@nexus/app`** | GitHub App | PR analysis, webhook handlers |

---

## Key Differentiators

| Capability | SonarQube | CodeClimate | Snyk | **NEXUS** |
|---|---|---|---|---|
| Static Analysis | Yes | Yes | Yes | **Yes** |
| Architecture Analysis | No | No | No | **Yes** |
| LLM Reasoning | No | No | No | **Yes** |
| Multi-Model Routing | No | No | No | **Yes** |
| Auto-Remediation | No | No | Partial | **Yes** |
| Domain-Aware | No | No | No | **Yes** |
| Trend Tracking | Basic | Yes | No | **Yes** |

---

## ProviderMesh — Multi-Model Intelligence

Nexus routes tasks to the optimal LLM based on complexity and cost:

| Task | Model | Cost/1M tokens | Use Case |
|------|-------|-----------------|----------|
| Quick classification | Claude Haiku | $0.80 in / $4.00 out | Triage, routing, simple analysis |
| Balanced analysis | Claude Sonnet | $3.00 in / $15.00 out | Code review, architecture assessment |
| Deep reasoning | Claude Opus | $15.00 in / $75.00 out | Complex refactoring, novel solutions |

```typescript
import { setupNexusMesh } from "@nexus/core";

const mesh = setupNexusMesh({ apiKey: process.env.ANTHROPIC_API_KEY });
// Automatically routes to the right model based on task complexity
```

---

## Development Status

### Completed (Sprints 1–10 + Resilience/Governance/Intelligence/Domain)

- [x] Core Engine — Orchestrator, ProviderMesh, ToolGateway, ModelRouter
- [x] Bridge Layer — Architect/Sentinel/Toolkit integration, NexusPipeline
- [x] Event System — NexusEventBus with typed events and correlation
- [x] Autonomy — PersonaSystem, IntentRouter, SessionState, DriftDetector, SkillComposer
- [x] ReactionEngine — Event-driven auto-response with severity filtering and cooldowns
- [x] Cloud Backend — Express API with auth, team, project management
- [x] Dashboard — React 18 + Tailwind components (charts, findings, pipeline, team)
- [x] MCP Servers — Perception, Reasoning, Validation protocol servers
- [x] CLI — `nexus analyze/score/status/history` with trend tracking
- [x] Architect Bridge — Transform layer for raw Architect → Nexus format
- [x] Action Executors — Console, File, Webhook, Composite execution
- [x] Claude Mesh Providers — Pre-configured Haiku/Sonnet/Opus providers
- [x] **Resilience Layer** — ResilientHttpClient (CircuitBreaker), TTLCache (LRU+TTL), RateLimiter (sliding window)
- [x] **Governance + Discovery** — SkillMeta (Zod validation), AutoRegistry (convention-based), Middleware Logging (correlation IDs)
- [x] **Intelligence Layer** — BM25 Search (zero-dep), LLMRecommender (BM25→LLM fallback), BatchExecutor (parallel DAG)
- [x] **Domain-Specific** — BR Validators 🇧🇷 (CPF/CNPJ/CEP), Markdown Formatting, QueryPlanner (objective decomposition)
- [x] **Self-Reflection Engine** — ConstitutionEngine (quality rules), ReflectionLoop (Training-Free RL), CriticAdapter (code-specific evaluation)
- [x] **Health Supervisor** — HealthSupervisor (8 health signals), StressDetector (15 patterns), HealthReportGenerator (Markdown reports)
- [x] **Supervisor Agent Router** — IntentClassifier (9 categories), RoutingStrategy (hybrid BM25+intent), SupervisorRouter (LLM-powered)
- [x] **MCP Client Gateway** — MCPClient (JSON-RPC 2.0), MCPDiscovery (multi-server), MCPToolBridge (MCP→Nexus skills)
- [x] **1170 tests passing across all packages**

### Next Up

- [ ] npm publish `@nexus/cli`
- [ ] GitHub Actions plugin
- [ ] Cloud dashboard deployment (Vercel)
- [ ] GitHub OAuth integration
- [ ] Landing page at girardellitecnologia.com/nexus

---

## Tech Stack

**Runtime:** Node.js 18+ · TypeScript 5.x · ESM

**Backend:** Express · Prisma · JWT · Zod validation

**Frontend:** React 18 · Tailwind CSS · Recharts · Next.js

**AI:** Anthropic Claude API (Haiku/Sonnet/Opus) · Multi-model routing

**Testing:** Jest · ts-jest · 1170 tests

**Infra:** Docker · AWS · GitHub Actions

---

## Author

**Camilo Girardelli** — CTO & Co-founder at [Girardelli Tecnologia](https://girardellitecnologia.com)

- IEEE Senior Member
- Anthropic Claude Partner Network
- 19+ years building enterprise systems (Vodafone, Western Union, NBCUniversal, Mobly)
- Postgraduate AI/ML — UT Austin

---

## License

**Business Source License 1.1** (BSL 1.1)

- **Free for:** personal use, evaluation, development, open-source projects, companies with <$1M annual revenue
- **Requires license for:** commercial use by companies with >$1M annual revenue
- **Change date:** 4 years after each release → converts to Apache 2.0
- **Additional use grant:** Non-production use is always permitted

See [LICENSE](LICENSE) for full terms.

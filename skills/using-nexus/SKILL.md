---
name: using-nexus
description: Use at the start of any session when working on a project with Nexus installed. Activates on session start, first interaction, or when the user asks about Nexus capabilities.
---

# Using Nexus

Nexus is an **autonomous engineering intelligence platform** that analyzes, reasons about, and auto-remediates architectural problems.

## Pipeline

```
Perception (Architect) → Reasoning (CTO Toolkit) → Validation (Sentinel) → Action
```

## Quick Commands

| Command | What it does |
|---------|-------------|
| `nexus analyze .` | Full codebase analysis with findings |
| `nexus score .` | Quick architecture score (0-100) |
| `nexus status` | Current health overview |
| `nexus history` | Trend tracking over time |

## Available Skills

- **verification-gate** — Evidence-based completion verification
- **architecture-review** — Full pipeline architecture analysis
- **systematic-debugging** — 4-phase structured debugging

## MCP Servers

Nexus exposes 3 MCP servers: `nexus-perception`, `nexus-validation`, `nexus-reasoning`.

## Key Modules

- **Tribunal** — 3-agent consensus voting for architecture decisions
- **ReactionEngine** — Event-driven auto-response to CI/PR/deploy events
- **DriftDetector** — Detects architectural degradation over time
- **ProviderMesh** — Multi-model LLM routing (Haiku/Sonnet/Opus)

---
name: architecture-review
description: Use when the user asks for architecture analysis, code quality assessment, architecture score, or when reviewing a codebase for structural issues, anti-patterns, coupling, or technical debt. Also activates on mentions of C4, dependency graph, or architecture score.
---

# Architecture Review

Orchestrates the full Nexus pipeline: Perception → Reasoning → Validation → Action.

## Process

### Phase 1: Perception (Architect)

Run architectural analysis to establish the baseline:

```bash
nexus analyze .
```

This produces:
- **Architecture Score** (0-100) across 6 dimensions
- **C4 Diagrams** (Context, Container, Component)
- **Dependency Graph** with coupling metrics
- **Anti-Pattern Detection** (God Class, Circular Deps, Feature Envy, etc.)
- **Temporal Analysis** — trend lines and pre-anti-pattern forecasts

Review the score breakdown. Identify the weakest dimensions.

### Phase 2: Reasoning (CTO Toolkit)

Based on findings, the ToolkitRouter selects the most relevant skills:

- Security findings → `security-review` skill
- Performance issues → `performance-profiling` skill
- Design violations → `design-patterns` skill
- Debt trajectory → `cost-optimization` skill

Each skill produces actionable recommendations with priority and estimated impact.

### Phase 3: Validation (Sentinel)

Run Sentinel's 7 validators against the recommendations:

- **QualityValidator** — Code quality standards
- **SecurityValidator** — Vulnerability detection
- **PerformanceValidator** — Performance impact
- **Sub-Agent Verification** — Independent adversarial review
- **ConsensusEngine** — Primary vs Adversarial agreement zones

If consensus is LOW on any finding, flag for human review.

### Phase 4: Action

Based on validated findings:

1. **Report** — Generate markdown report with score, findings, recommendations
2. **Alert** — If critical findings, trigger ReactionEngine (Slack/webhook)
3. **Track** — Save snapshot for trend tracking via `nexus history`

## Output Format

```markdown
## Architecture Review — [Project Name]

**Score: XX/100** (Δ from last: +/-N)

### Critical Findings
[Severity: CRITICAL/HIGH findings with recommendations]

### Trend
[Improving/Stable/Degrading — based on temporal analysis]

### Recommendations (Priority Order)
1. [Finding] → [Action] (Estimated impact: +N points)
```

## When to Escalate

- Score < 50 → Recommend immediate remediation sprint
- 3+ CRITICAL findings → Involve tech lead / architect
- Degrading trend for 3+ snapshots → Structural intervention needed

/**
 * Agent Tribunal Pattern — Multi-agent architecture review board
 *
 * 3 independent agents analyze the same project in parallel.
 * A Mediator agent synthesizes their findings via weighted voting
 * to produce a unified verdict.
 *
 * Agents:
 *   1. Architect Agent — focuses on structure, layers, dependencies
 *   2. Security Agent — focuses on vulnerabilities, compliance, risk
 *   3. Quality Agent — focuses on testing, performance, maintainability
 *
 * The Mediator uses weighted consensus:
 *   - Agreement (all 3 agents) → High confidence
 *   - Majority (2/3) → Medium confidence
 *   - Split (1/3) → Low confidence, flagged for human review
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type AgentRole = "architect" | "security" | "quality";

export interface TribunalFinding {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  source: AgentRole;
  affectedFiles: string[];
  recommendation: string;
}

export interface AgentVerdict {
  role: AgentRole;
  score: number;
  findings: TribunalFinding[];
  summary: string;
  duration: number;
}

export interface TribunalVerdict {
  /** Unified score from weighted voting */
  score: number;
  /** Individual agent verdicts */
  agents: AgentVerdict[];
  /** Findings where agents agree */
  consensus: ConsensusFinding[];
  /** Findings where agents disagree */
  disputes: DisputeFinding[];
  /** Final synthesized recommendations */
  recommendations: string[];
  /** Overall confidence in the verdict */
  confidence: "high" | "medium" | "low";
  duration: number;
}

export interface ConsensusFinding {
  finding: TribunalFinding;
  agreedBy: AgentRole[];
  confidence: number;
}

export interface DisputeFinding {
  finding: TribunalFinding;
  raisedBy: AgentRole;
  rejectedBy: AgentRole[];
  reason: string;
}

/** Pluggable agent backend — runs the actual analysis */
export interface TribunalAgent {
  role: AgentRole;
  analyze(projectPath: string, context?: Record<string, unknown>): Promise<AgentVerdict>;
}

export interface TribunalConfig {
  /** Weight per agent role (default: equal at 1.0) */
  weights?: Partial<Record<AgentRole, number>>;
  /** Minimum agents that must agree for consensus (default: 2) */
  consensusThreshold?: number;
  /** Timeout per agent in ms (default: 30000) */
  agentTimeout?: number;
  /** If true, continue even if an agent fails (default: true) */
  tolerateFailures?: boolean;
}

const DEFAULT_CONFIG: Required<TribunalConfig> = {
  weights: { architect: 1.0, security: 1.2, quality: 1.0 },
  consensusThreshold: 2,
  agentTimeout: 30000,
  tolerateFailures: true,
};

// ═══════════════════════════════════════════════════════════════
// TRIBUNAL
// ═══════════════════════════════════════════════════════════════

export class Tribunal {
  private agents: TribunalAgent[];
  private config: Required<TribunalConfig>;

  constructor(agents: TribunalAgent[], config?: TribunalConfig) {
    if (agents.length === 0) {
      throw new Error("Tribunal requires at least one agent");
    }
    this.agents = agents;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Convene the tribunal — all agents analyze in parallel,
   * then the mediator synthesizes the verdict.
   */
  async convene(
    projectPath: string,
    context?: Record<string, unknown>,
  ): Promise<TribunalVerdict> {
    const start = Date.now();

    // Phase 1: Parallel agent execution
    const verdicts = await this.executeAgents(projectPath, context);

    // Phase 2: Mediation — synthesize findings
    const consensus = this.findConsensus(verdicts);
    const disputes = this.findDisputes(verdicts);

    // Phase 3: Weighted score
    const score = this.calculateWeightedScore(verdicts);

    // Phase 4: Recommendations
    const recommendations = this.synthesizeRecommendations(consensus, disputes);

    // Phase 5: Confidence
    const confidence = this.assessConfidence(verdicts, consensus, disputes);

    return {
      score,
      agents: verdicts,
      consensus,
      disputes,
      recommendations,
      confidence,
      duration: Date.now() - start,
    };
  }

  private async executeAgents(
    projectPath: string,
    context?: Record<string, unknown>,
  ): Promise<AgentVerdict[]> {
    const promises = this.agents.map(agent =>
      this.executeWithTimeout(agent, projectPath, context),
    );

    const results = await Promise.allSettled(promises);
    const verdicts: AgentVerdict[] = [];

    for (const result of results) {
      if (result.status === "fulfilled") {
        verdicts.push(result.value);
      } else if (!this.config.tolerateFailures) {
        throw new Error(`Agent failed: ${result.reason}`);
      }
    }

    return verdicts;
  }

  private async executeWithTimeout(
    agent: TribunalAgent,
    projectPath: string,
    context?: Record<string, unknown>,
  ): Promise<AgentVerdict> {
    return Promise.race([
      agent.analyze(projectPath, context),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Agent '${agent.role}' timed out after ${this.config.agentTimeout}ms`)),
          this.config.agentTimeout,
        ),
      ),
    ]);
  }

  /**
   * Find consensus — findings raised by multiple agents on the same topic
   */
  private findConsensus(verdicts: AgentVerdict[]): ConsensusFinding[] {
    const consensusMap = new Map<string, { finding: TribunalFinding; agents: Set<AgentRole> }>();

    for (const verdict of verdicts) {
      for (const finding of verdict.findings) {
        const key = this.findingKey(finding);
        const existing = consensusMap.get(key);
        if (existing) {
          existing.agents.add(verdict.role);
        } else {
          consensusMap.set(key, {
            finding,
            agents: new Set([verdict.role]),
          });
        }
      }
    }

    const result: ConsensusFinding[] = [];
    for (const { finding, agents } of consensusMap.values()) {
      if (agents.size >= this.config.consensusThreshold) {
        result.push({
          finding,
          agreedBy: Array.from(agents),
          confidence: agents.size / verdicts.length,
        });
      }
    }

    return result.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Find disputes — findings raised by only one agent
   */
  private findDisputes(verdicts: AgentVerdict[]): DisputeFinding[] {
    const allKeys = new Map<string, { finding: TribunalFinding; agents: Set<AgentRole> }>();

    for (const verdict of verdicts) {
      for (const finding of verdict.findings) {
        const key = this.findingKey(finding);
        const existing = allKeys.get(key);
        if (existing) {
          existing.agents.add(verdict.role);
        } else {
          allKeys.set(key, { finding, agents: new Set([verdict.role]) });
        }
      }
    }

    const disputes: DisputeFinding[] = [];
    const allRoles = verdicts.map(v => v.role);

    for (const { finding, agents } of allKeys.values()) {
      if (agents.size === 1) {
        const raisedBy = Array.from(agents)[0];
        disputes.push({
          finding,
          raisedBy,
          rejectedBy: allRoles.filter(r => r !== raisedBy),
          reason: `Only ${raisedBy} agent flagged this issue`,
        });
      }
    }

    return disputes;
  }

  /**
   * Create a normalized key for matching findings across agents
   */
  private findingKey(finding: TribunalFinding): string {
    // Match by category + severity + overlapping affected files
    const files = finding.affectedFiles.sort().join(",");
    return `${finding.category}:${finding.severity}:${files}`.toLowerCase();
  }

  /**
   * Calculate weighted average score across agent verdicts
   */
  private calculateWeightedScore(verdicts: AgentVerdict[]): number {
    let totalWeight = 0;
    let weightedSum = 0;

    for (const verdict of verdicts) {
      const weight = this.config.weights[verdict.role] ?? 1.0;
      weightedSum += verdict.score * weight;
      totalWeight += weight;
    }

    return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  }

  /**
   * Synthesize recommendations from consensus + disputes
   */
  private synthesizeRecommendations(
    consensus: ConsensusFinding[],
    disputes: DisputeFinding[],
  ): string[] {
    const recs: string[] = [];

    // Consensus items get priority
    for (const item of consensus) {
      recs.push(
        `[${item.agreedBy.length}/${item.agreedBy.length + disputes.length > 0 ? "agreed" : ""}] ` +
        `${item.finding.severity.toUpperCase()}: ${item.finding.recommendation}`,
      );
    }

    // Critical disputes still get included with lower confidence
    for (const dispute of disputes) {
      if (dispute.finding.severity === "critical" || dispute.finding.severity === "high") {
        recs.push(
          `[${dispute.raisedBy}-only] ${dispute.finding.severity.toUpperCase()}: ` +
          `${dispute.finding.recommendation} (needs human review)`,
        );
      }
    }

    return recs.slice(0, 10);
  }

  /**
   * Assess overall confidence
   */
  private assessConfidence(
    verdicts: AgentVerdict[],
    consensus: ConsensusFinding[],
    disputes: DisputeFinding[],
  ): TribunalVerdict["confidence"] {
    if (verdicts.length < 2) return "low";

    const totalFindings = consensus.length + disputes.length;
    if (totalFindings === 0) return "high";

    const consensusRatio = consensus.length / totalFindings;
    if (consensusRatio >= 0.7) return "high";
    if (consensusRatio >= 0.4) return "medium";
    return "low";
  }
}

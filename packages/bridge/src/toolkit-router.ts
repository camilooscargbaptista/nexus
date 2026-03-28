/**
 * Toolkit Router — Routes Architect findings to CTO Toolkit skills
 *
 * The intelligence layer that decides which of the 54 CTO Toolkit skills
 * should be activated based on what Architect detected.
 *
 * This is where context-aware skill composition happens:
 *   Anti-pattern detected → relevant skills identified → guidance generated
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type {
  ArchitectureSnapshot,
  AntiPatternFinding,
  GuidanceResult,
  GuidanceFinding,
  Recommendation,
  SkillCategory,
  Severity,
  ConfidenceLevel,
  NexusEventType,
  NexusLayer,
} from "@camilooscargbaptista/nexus-types";
import type { NexusEventBus } from "@camilooscargbaptista/nexus-events";

// ═══════════════════════════════════════════════════════════════
// SKILL ROUTING TABLE
// ═══════════════════════════════════════════════════════════════

interface SkillRoute {
  skillName: string;
  category: SkillCategory;
  triggers: SkillTrigger[];
  referenceFiles: string[];
}

interface SkillTrigger {
  type: "anti_pattern" | "layer" | "framework" | "domain" | "score_threshold";
  match: string | string[];
  priority: number;
}

/**
 * The complete routing table: maps Architect detections to CTO Toolkit skills.
 * Each entry defines when a skill should activate based on analysis results.
 */
const SKILL_ROUTES: SkillRoute[] = [
  // ─── Architecture & Patterns ───
  {
    skillName: "design-patterns",
    category: "architecture" as SkillCategory,
    triggers: [
      { type: "anti_pattern", match: ["god_class", "feature_envy", "shotgun_surgery"], priority: 1 },
      { type: "score_threshold", match: "coupling<50", priority: 2 },
    ],
    referenceFiles: ["solid-patterns.md", "refactoring-guide.md"],
  },
  {
    skillName: "adr",
    category: "architecture" as SkillCategory,
    triggers: [
      { type: "anti_pattern", match: ["circular_dependency", "leaky_abstraction"], priority: 1 },
      { type: "score_threshold", match: "overall<60", priority: 2 },
    ],
    referenceFiles: [],
  },
  {
    skillName: "event-driven-architecture",
    category: "architecture" as SkillCategory,
    triggers: [
      { type: "framework", match: ["kafka", "rabbitmq", "sqs", "sns", "nats"], priority: 1 },
      { type: "anti_pattern", match: ["distributed_monolith", "tight_coupling"], priority: 2 },
    ],
    referenceFiles: [],
  },
  {
    skillName: "domain-modeling",
    category: "architecture" as SkillCategory,
    triggers: [
      { type: "anti_pattern", match: ["anemic_domain", "god_class"], priority: 1 },
      { type: "score_threshold", match: "cohesion<50", priority: 2 },
    ],
    referenceFiles: [],
  },

  // ─── Code Review (language-specific) ───
  {
    skillName: "backend-review",
    category: "code-review" as SkillCategory,
    triggers: [
      { type: "framework", match: ["nestjs", "express", "fastify", "spring", "django", "fastapi", "rails"], priority: 1 },
      { type: "layer", match: ["api", "service"], priority: 2 },
    ],
    referenceFiles: ["nodejs-patterns.md", "java-patterns.md", "payment-security-checklist.md"],
  },
  {
    skillName: "frontend-review",
    category: "code-review" as SkillCategory,
    triggers: [
      { type: "framework", match: ["react", "angular", "vue", "svelte", "nextjs"], priority: 1 },
      { type: "layer", match: ["ui"], priority: 2 },
    ],
    referenceFiles: [],
  },
  {
    skillName: "flutter-review",
    category: "code-review" as SkillCategory,
    triggers: [
      { type: "framework", match: ["flutter", "dart"], priority: 1 },
    ],
    referenceFiles: [],
  },
  {
    skillName: "python-review",
    category: "code-review" as SkillCategory,
    triggers: [
      { type: "framework", match: ["django", "fastapi", "flask", "pytorch", "tensorflow"], priority: 1 },
    ],
    referenceFiles: [],
  },
  {
    skillName: "go-review",
    category: "code-review" as SkillCategory,
    triggers: [{ type: "framework", match: ["go", "gin", "echo", "fiber"], priority: 1 }],
    referenceFiles: [],
  },
  {
    skillName: "rust-review",
    category: "code-review" as SkillCategory,
    triggers: [{ type: "framework", match: ["rust", "actix", "axum", "tokio"], priority: 1 }],
    referenceFiles: [],
  },

  // ─── Security ───
  {
    skillName: "security-review",
    category: "security" as SkillCategory,
    triggers: [
      { type: "anti_pattern", match: ["hardcoded_secret", "sql_injection", "xss", "insecure_auth"], priority: 0 },
      { type: "domain", match: ["fintech", "healthtech"], priority: 1 },
    ],
    referenceFiles: ["owasp-top10-checklist.md", "jwt-auth-patterns.md", "rbac-implementation.md"],
  },
  {
    skillName: "pentest",
    category: "security" as SkillCategory,
    triggers: [
      { type: "anti_pattern", match: ["hardcoded_secret", "sql_injection"], priority: 0 },
    ],
    referenceFiles: [],
  },
  {
    skillName: "compliance-review",
    category: "security" as SkillCategory,
    triggers: [
      { type: "domain", match: ["fintech", "healthtech"], priority: 1 },
    ],
    referenceFiles: [],
  },

  // ─── DevOps ───
  {
    skillName: "kubernetes-review",
    category: "devops" as SkillCategory,
    triggers: [
      { type: "framework", match: ["kubernetes", "k8s", "helm"], priority: 1 },
    ],
    referenceFiles: [],
  },
  {
    skillName: "terraform-iac",
    category: "devops" as SkillCategory,
    triggers: [
      { type: "framework", match: ["terraform", "pulumi", "cloudformation"], priority: 1 },
    ],
    referenceFiles: [],
  },
  {
    skillName: "observability",
    category: "devops" as SkillCategory,
    triggers: [
      { type: "score_threshold", match: "overall<50", priority: 3 },
    ],
    referenceFiles: [],
  },

  // ─── Quality ───
  {
    skillName: "testing-strategy",
    category: "quality" as SkillCategory,
    triggers: [
      { type: "score_threshold", match: "overall<70", priority: 2 },
    ],
    referenceFiles: [],
  },
  {
    skillName: "systematic-debugging",
    category: "quality" as SkillCategory,
    triggers: [
      { type: "anti_pattern", match: ["missing_error_handling", "swallowed_exception"], priority: 1 },
    ],
    referenceFiles: [],
  },

  // ─── Database & Performance ───
  {
    skillName: "database-review",
    category: "database" as SkillCategory,
    triggers: [
      { type: "anti_pattern", match: ["n_plus_one", "missing_index", "shared_database"], priority: 1 },
      { type: "layer", match: ["data"], priority: 2 },
    ],
    referenceFiles: [],
  },
  {
    skillName: "performance-profiling",
    category: "performance" as SkillCategory,
    triggers: [
      { type: "anti_pattern", match: ["n_plus_one", "blocking_io", "memory_leak"], priority: 1 },
      { type: "score_threshold", match: "overall<50", priority: 2 },
    ],
    referenceFiles: [],
  },
];

// ═══════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════

export class ToolkitRouter {
  constructor(private eventBus: NexusEventBus) {}

  /**
   * Given an ArchitectureSnapshot, determine which CTO Toolkit skills
   * should be activated and generate guidance results.
   */
  async route(snapshot: ArchitectureSnapshot): Promise<GuidanceResult[]> {
    const matchedSkills = this.matchSkills(snapshot);
    const results: GuidanceResult[] = [];

    for (const { route, triggers, priority } of matchedSkills) {
      const result = this.generateGuidance(route, snapshot, triggers, priority);
      results.push(result);

      // Emit event
      await this.eventBus.publish(
        "skill.triggered" as NexusEventType,
        "reasoning" as NexusLayer,
        {
          skillName: route.skillName,
          category: route.category,
          triggerCount: triggers.length,
          priority,
        },
        {
          projectPath: snapshot.projectPath,
          projectName: snapshot.projectName,
          domain: snapshot.domain,
        }
      );
    }

    // Emit overall guidance event
    if (results.length > 0) {
      await this.eventBus.publish(
        "guidance.generated" as NexusEventType,
        "reasoning" as NexusLayer,
        {
          skillsActivated: results.length,
          skills: results.map((r) => r.skillName),
          totalFindings: results.reduce((sum, r) => sum + r.findings.length, 0),
          totalRecommendations: results.reduce((sum, r) => sum + r.recommendations.length, 0),
        },
        {
          projectPath: snapshot.projectPath,
          projectName: snapshot.projectName,
          domain: snapshot.domain,
        }
      );
    }

    return results.sort((a, b) => {
      const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
      const aMax = Math.min(...a.findings.map((f) => sevOrder[f.severity] ?? 5));
      const bMax = Math.min(...b.findings.map((f) => sevOrder[f.severity] ?? 5));
      return aMax - bMax;
    });
  }

  /**
   * Match skills based on the analysis snapshot.
   */
  private matchSkills(
    snapshot: ArchitectureSnapshot
  ): Array<{ route: SkillRoute; triggers: string[]; priority: number }> {
    const matches: Array<{ route: SkillRoute; triggers: string[]; priority: number }> = [];

    for (const route of SKILL_ROUTES) {
      const matchedTriggers: string[] = [];
      let bestPriority = Infinity;

      for (const trigger of route.triggers) {
        const matched = this.evaluateTrigger(trigger, snapshot);
        if (matched) {
          matchedTriggers.push(`${trigger.type}:${Array.isArray(trigger.match) ? trigger.match.join(",") : trigger.match}`);
          bestPriority = Math.min(bestPriority, trigger.priority);
        }
      }

      if (matchedTriggers.length > 0) {
        matches.push({ route, triggers: matchedTriggers, priority: bestPriority });
      }
    }

    return matches.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Evaluate whether a trigger condition is met.
   */
  private evaluateTrigger(trigger: SkillTrigger, snapshot: ArchitectureSnapshot): boolean {
    const matchValues = Array.isArray(trigger.match) ? trigger.match : [trigger.match];

    switch (trigger.type) {
      case "anti_pattern":
        return snapshot.antiPatterns.some((ap) =>
          matchValues.some((m) => ap.pattern.toLowerCase().includes(m.toLowerCase()))
        );

      case "layer":
        return snapshot.layers.some((l) =>
          matchValues.some((m) => l.type === m || l.name.toLowerCase().includes(m.toLowerCase()))
        );

      case "framework":
        return snapshot.frameworks.some((f) =>
          matchValues.some((m) => f.toLowerCase().includes(m.toLowerCase()))
        );

      case "domain":
        return matchValues.some((m) => m.toLowerCase() === snapshot.domain);

      case "score_threshold": {
        const expr = matchValues[0];
        if (!expr) return false;
        const match = expr.match(/^(\w+)<(\d+)$/);
        if (!match) return false;
        const [, field, threshold] = match;
        const value = field === "overall"
          ? snapshot.score.overall
          : snapshot.score[field as keyof typeof snapshot.score] ?? 100;
        return (value as number) < parseInt(threshold!, 10);
      }

      default:
        return false;
    }
  }

  /**
   * Generate a GuidanceResult for a matched skill.
   */
  private generateGuidance(
    route: SkillRoute,
    snapshot: ArchitectureSnapshot,
    triggers: string[],
    _priority: number
  ): GuidanceResult {
    const findings: GuidanceFinding[] = [];
    const recommendations: Recommendation[] = [];

    // Generate findings from anti-patterns
    for (const ap of snapshot.antiPatterns) {
      const isRelevant = route.triggers.some(
        (t) =>
          t.type === "anti_pattern" &&
          (Array.isArray(t.match) ? t.match : [t.match]).some((m) =>
            ap.pattern.toLowerCase().includes(m.toLowerCase())
          )
      );

      if (isRelevant) {
        const findingId = `${route.skillName}-${ap.pattern}-${findings.length}`;
        findings.push({
          id: findingId,
          severity: ap.severity as Severity,
          title: `${ap.pattern} detected`,
          description: ap.description,
          skillSource: route.skillName,
          referenceDoc: route.referenceFiles[0],
          affectedFiles: ap.affectedFiles,
        });

        if (ap.suggestedAction) {
          recommendations.push({
            id: `rec-${findingId}`,
            title: `Fix: ${ap.pattern}`,
            description: ap.suggestedAction,
            priority: ap.severity as Severity,
            effort: this.estimateEffort(ap),
            impact: {
              scoreImprovement: ap.estimatedImpact ?? 5,
              riskReduction: ap.severity as Severity,
              businessImpact: `Reduces ${ap.pattern.toLowerCase()} risk in ${snapshot.domain} context`,
            },
            linkedFindings: [findingId],
          });
        }
      }
    }

    // Generate score-based findings
    for (const trigger of route.triggers) {
      if (trigger.type === "score_threshold") {
        const expr = Array.isArray(trigger.match) ? trigger.match[0] : trigger.match;
        if (!expr) continue;
        const match = expr.match(/^(\w+)<(\d+)$/);
        if (!match) continue;
        const [, field, threshold] = match;
        const value = field === "overall"
          ? snapshot.score.overall
          : snapshot.score[field as keyof typeof snapshot.score] ?? 100;

        if ((value as number) < parseInt(threshold!, 10)) {
          findings.push({
            id: `${route.skillName}-score-${field}`,
            severity: "medium" as Severity,
            title: `${field} score below threshold`,
            description: `The ${field} score is ${value}/100, below the recommended threshold of ${threshold}. The ${route.skillName} skill can provide guidance on improving this dimension.`,
            skillSource: route.skillName,
            affectedFiles: [],
          });
        }
      }
    }

    return {
      skillName: route.skillName,
      category: route.category,
      findings,
      recommendations,
      estimatedEffort: {
        hours: findings.length * 2,
        size: findings.length <= 2 ? "S" : findings.length <= 5 ? "M" : "L",
        complexity: findings.some((f) => f.severity === ("critical" as Severity)) ? "high" : "medium",
      },
      confidence: findings.length > 0 ? ("high" as ConfidenceLevel) : ("medium" as ConfidenceLevel),
    };
  }

  private estimateEffort(ap: AntiPatternFinding): { hours: number; size: "XS" | "S" | "M" | "L" | "XL"; complexity: "low" | "medium" | "high" } {
    const fileCount = ap.affectedFiles.length;
    if (fileCount <= 1) return { hours: 2, size: "S", complexity: "low" };
    if (fileCount <= 5) return { hours: 8, size: "M", complexity: "medium" };
    return { hours: 24, size: "L", complexity: "high" };
  }
}

/**
 * Declarative Skill Registry — YAML-like frontmatter activation with confidence scoring
 *
 * Inspired by everything-claude-code's skill activation system where each skill
 * has YAML frontmatter defining triggers, model preferences, and confidence thresholds.
 *
 * Each skill registers a SkillDescriptor that declares:
 *   - When to activate (trigger patterns: file globs, anti-patterns, severity thresholds)
 *   - What model tier to prefer (fast/balanced/powerful)
 *   - Minimum confidence threshold to emit findings
 *   - Dependencies on other skills
 *   - Expected execution cost (token estimate)
 *
 * The registry uses these descriptors to:
 *   1. Auto-select relevant skills for a given snapshot
 *   2. Compute confidence scores for each match
 *   3. Order execution by dependency graph
 *   4. Filter low-confidence activations
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import type { ArchitectureSnapshot, Severity, Domain } from "@camilooscargbaptista/nexus-types";
import type { ModelTier } from "@camilooscargbaptista/nexus-core";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface SkillDescriptor {
  /** Unique skill identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** Version string (semver) */
  version: string;
  /** Skill category */
  category: SkillDescriptorCategory;
  /** Trigger configuration — when should this skill activate? */
  triggers: SkillTrigger;
  /** Preferred model tier for execution */
  preferredTier: ModelTier;
  /** Minimum confidence to emit findings (0-1, default: 0.5) */
  minConfidence: number;
  /** Skills that must run before this one */
  dependsOn: string[];
  /** Estimated token cost per execution */
  estimatedTokens: number;
  /** Domains where this skill is particularly relevant */
  targetDomains?: Domain[];
  /** Tags for search/filtering */
  tags: string[];
  /** Whether this skill is enabled (default: true) */
  enabled: boolean;
}

export type SkillDescriptorCategory =
  | "security"
  | "architecture"
  | "performance"
  | "testing"
  | "devops"
  | "database"
  | "code-quality"
  | "documentation"
  | "compliance";

export interface SkillTrigger {
  /** Activate when these file patterns exist in the project */
  filePatterns?: string[];
  /** Activate when these anti-patterns are detected */
  antiPatterns?: string[];
  /** Activate when overall score is below this threshold */
  scoreBelowThreshold?: number;
  /** Activate when specific score dimension is below threshold */
  dimensionThresholds?: Record<string, number>;
  /** Activate when these frameworks are detected */
  frameworks?: string[];
  /** Activate for specific domains only */
  domains?: Domain[];
  /** Activate when findings of these severities exist */
  severityPresent?: Severity[];
  /** Always activate (ignore all other triggers) */
  always?: boolean;
}

export interface SkillMatch {
  skill: SkillDescriptor;
  confidence: number; // 0-1
  matchReasons: string[];
  estimatedValue: number; // 0-100 — how valuable this skill is for this context
}

export interface ActivationPlan {
  /** Skills to run, in dependency-resolved order */
  skills: SkillMatch[];
  /** Skills that matched but were filtered (low confidence, disabled, etc.) */
  filtered: { skill: string; reason: string }[];
  /** Total estimated tokens for this plan */
  totalEstimatedTokens: number;
  /** Execution order (respects dependencies) */
  executionOrder: string[];
}

// ═══════════════════════════════════════════════════════════════
// SKILL REGISTRY
// ═══════════════════════════════════════════════════════════════

export class SkillRegistry {
  private skills: Map<string, SkillDescriptor> = new Map();

  /**
   * Register a skill descriptor.
   */
  register(descriptor: SkillDescriptor): void {
    this.skills.set(descriptor.name, descriptor);
  }

  /**
   * Unregister a skill.
   */
  unregister(name: string): boolean {
    return this.skills.delete(name);
  }

  /**
   * Get a skill by name.
   */
  get(name: string): SkillDescriptor | undefined {
    return this.skills.get(name);
  }

  /**
   * List all registered skills, optionally filtered.
   */
  list(filter?: {
    category?: SkillDescriptorCategory;
    enabled?: boolean;
    domain?: Domain;
    tag?: string;
  }): SkillDescriptor[] {
    let skills = Array.from(this.skills.values());

    if (filter?.category) skills = skills.filter(s => s.category === filter.category);
    if (filter?.enabled !== undefined) skills = skills.filter(s => s.enabled === filter.enabled);
    if (filter?.domain) skills = skills.filter(s =>
      !s.targetDomains || s.targetDomains.includes(filter.domain!),
    );
    if (filter?.tag) skills = skills.filter(s => s.tags.includes(filter.tag!));

    return skills;
  }

  /**
   * Match skills against a snapshot and produce an activation plan.
   * This is the main entry point for auto-activation.
   */
  activate(
    snapshot: ArchitectureSnapshot,
    options: {
      minConfidence?: number;
      maxSkills?: number;
      forcedSkills?: string[];
      excludeSkills?: string[];
    } = {},
  ): ActivationPlan {
    const minConf = options.minConfidence ?? 0.3;
    const maxSkills = options.maxSkills ?? 20;
    const forced = new Set(options.forcedSkills ?? []);
    const excluded = new Set(options.excludeSkills ?? []);

    const matches: SkillMatch[] = [];
    const filtered: { skill: string; reason: string }[] = [];

    for (const skill of this.skills.values()) {
      // Skip excluded
      if (excluded.has(skill.name)) {
        filtered.push({ skill: skill.name, reason: "Explicitly excluded" });
        continue;
      }

      // Skip disabled (unless forced)
      if (!skill.enabled && !forced.has(skill.name)) {
        filtered.push({ skill: skill.name, reason: "Skill disabled" });
        continue;
      }

      const match = this.evaluateTriggers(skill, snapshot);

      // Force-include even if triggers don't match
      if (forced.has(skill.name) && match.confidence < minConf) {
        match.confidence = Math.max(match.confidence, minConf);
        match.matchReasons.push("Force-included");
      }

      if (match.confidence >= minConf) {
        matches.push(match);
      } else {
        filtered.push({
          skill: skill.name,
          reason: `Confidence ${(match.confidence * 100).toFixed(0)}% below threshold ${(minConf * 100).toFixed(0)}%`,
        });
      }
    }

    // Sort by estimated value (descending), then by confidence
    matches.sort((a, b) => {
      const valueDiff = b.estimatedValue - a.estimatedValue;
      if (Math.abs(valueDiff) > 5) return valueDiff;
      return b.confidence - a.confidence;
    });

    // Trim to maxSkills
    const selected = matches.slice(0, maxSkills);
    for (const dropped of matches.slice(maxSkills)) {
      filtered.push({ skill: dropped.skill.name, reason: "Exceeded max skills limit" });
    }

    // Resolve execution order (topological sort on dependencies)
    const executionOrder = this.resolveOrder(selected);

    // Reorder selected to match execution order
    const orderedSkills = executionOrder
      .map(name => selected.find(m => m.skill.name === name))
      .filter((m): m is SkillMatch => m !== undefined);

    return {
      skills: orderedSkills,
      filtered,
      totalEstimatedTokens: orderedSkills.reduce((sum, m) => sum + m.skill.estimatedTokens, 0),
      executionOrder,
    };
  }

  /** Total registered skills */
  get size(): number {
    return this.skills.size;
  }

  // ─── Trigger evaluation ─────────────────────────────────────

  private evaluateTriggers(skill: SkillDescriptor, snapshot: ArchitectureSnapshot): SkillMatch {
    const reasons: string[] = [];
    let totalWeight = 0;
    let matchedWeight = 0;

    const triggers = skill.triggers;

    // Always trigger
    if (triggers.always) {
      return {
        skill,
        confidence: 0.9,
        matchReasons: ["Always-on skill"],
        estimatedValue: 50,
      };
    }

    // File patterns
    if (triggers.filePatterns && triggers.filePatterns.length > 0) {
      totalWeight += 20;
      const projectFiles = snapshot.layers.flatMap(l => l.files);
      const matched = triggers.filePatterns.some(pattern =>
        projectFiles.some(f => simpleMatch(f, pattern)),
      );
      if (matched) {
        matchedWeight += 20;
        reasons.push("File pattern matched");
      }
    }

    // Anti-patterns
    if (triggers.antiPatterns && triggers.antiPatterns.length > 0) {
      totalWeight += 30;
      const detectedPatterns = snapshot.antiPatterns.map(ap => ap.pattern.toLowerCase());
      const matched = triggers.antiPatterns.filter(p =>
        detectedPatterns.some(dp => dp.includes(p.toLowerCase())),
      );
      if (matched.length > 0) {
        const ratio = matched.length / triggers.antiPatterns.length;
        matchedWeight += 30 * ratio;
        reasons.push(`Anti-pattern match: ${matched.join(", ")}`);
      }
    }

    // Score threshold
    if (triggers.scoreBelowThreshold !== undefined) {
      totalWeight += 25;
      if (snapshot.score.overall < triggers.scoreBelowThreshold) {
        matchedWeight += 25;
        reasons.push(`Score ${snapshot.score.overall} below threshold ${triggers.scoreBelowThreshold}`);
      }
    }

    // Dimension thresholds
    if (triggers.dimensionThresholds) {
      const dims = Object.entries(triggers.dimensionThresholds);
      if (dims.length > 0) {
        totalWeight += 20;
        let dimMatches = 0;
        for (const [dim, threshold] of dims) {
          const value = (snapshot.score as unknown as Record<string, number>)[dim];
          if (value !== undefined && value < threshold) {
            dimMatches++;
            reasons.push(`${dim} score ${value} below ${threshold}`);
          }
        }
        matchedWeight += 20 * (dimMatches / dims.length);
      }
    }

    // Frameworks
    if (triggers.frameworks && triggers.frameworks.length > 0) {
      totalWeight += 15;
      const matched = triggers.frameworks.filter(fw =>
        snapshot.frameworks.some(f => f.toLowerCase().includes(fw.toLowerCase())),
      );
      if (matched.length > 0) {
        matchedWeight += 15;
        reasons.push(`Framework match: ${matched.join(", ")}`);
      }
    }

    // Domain
    if (triggers.domains && triggers.domains.length > 0) {
      totalWeight += 10;
      if (triggers.domains.includes(snapshot.domain)) {
        matchedWeight += 10;
        reasons.push(`Domain match: ${snapshot.domain}`);
      }
    }

    // Severity present
    if (triggers.severityPresent && triggers.severityPresent.length > 0) {
      totalWeight += 20;
      const presentSeverities = new Set(snapshot.antiPatterns.map(ap => ap.severity));
      const matched = triggers.severityPresent.some(sev => presentSeverities.has(sev));
      if (matched) {
        matchedWeight += 20;
        reasons.push("Matching severity findings present");
      }
    }

    // Compute confidence
    const confidence = totalWeight > 0 ? matchedWeight / totalWeight : 0;

    // Estimate value based on confidence + severity of issues
    const hasCritical = snapshot.antiPatterns.some(ap =>
      ap.severity === "critical" as any,
    );
    const valueBoost = hasCritical ? 20 : 0;
    const estimatedValue = Math.min(Math.round(confidence * 80 + valueBoost), 100);

    return { skill, confidence, matchReasons: reasons, estimatedValue };
  }

  // ─── Dependency resolution ──────────────────────────────────

  private resolveOrder(matches: SkillMatch[]): string[] {
    const names = new Set(matches.map(m => m.skill.name));
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Build adjacency list
    for (const match of matches) {
      const name = match.skill.name;
      if (!graph.has(name)) graph.set(name, []);
      if (!inDegree.has(name)) inDegree.set(name, 0);

      for (const dep of match.skill.dependsOn) {
        if (names.has(dep)) {
          graph.get(dep)?.push(name) ?? graph.set(dep, [name]);
          inDegree.set(name, (inDegree.get(name) ?? 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
      if (degree === 0) queue.push(name);
    }

    const order: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      order.push(current);

      for (const neighbor of graph.get(current) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) queue.push(neighbor);
      }
    }

    // Add any remaining (cycle or missing deps)
    for (const match of matches) {
      if (!order.includes(match.skill.name)) {
        order.push(match.skill.name);
      }
    }

    return order;
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Simple glob-like matching (supports * and **) */
function simpleMatch(filepath: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/\{\{GLOBSTAR\}\}/g, ".*");
  return new RegExp(`^${regex}$`).test(filepath);
}

// ═══════════════════════════════════════════════════════════════
// BUILT-IN SKILL DESCRIPTORS
// ═══════════════════════════════════════════════════════════════

export const BUILT_IN_SKILLS: SkillDescriptor[] = [
  {
    name: "security-review",
    description: "Comprehensive security vulnerability analysis",
    version: "1.0.0",
    category: "security",
    triggers: {
      antiPatterns: ["hardcoded_secret", "sql_injection", "xss", "insecure_auth"],
      scoreBelowThreshold: 70,
      severityPresent: ["critical" as Severity, "high" as Severity],
    },
    preferredTier: "balanced",
    minConfidence: 0.4,
    dependsOn: [],
    estimatedTokens: 5000,
    tags: ["security", "vulnerability", "owasp"],
    enabled: true,
  },
  {
    name: "architecture-review",
    description: "Deep architecture patterns and anti-patterns analysis",
    version: "1.0.0",
    category: "architecture",
    triggers: {
      antiPatterns: ["god_class", "circular_dependency", "feature_envy", "shotgun_surgery"],
      dimensionThresholds: { modularity: 60, coupling: 60 },
    },
    preferredTier: "powerful",
    minConfidence: 0.3,
    dependsOn: [],
    estimatedTokens: 8000,
    tags: ["architecture", "patterns", "solid"],
    enabled: true,
  },
  {
    name: "performance-profiling",
    description: "Performance bottleneck detection and optimization suggestions",
    version: "1.0.0",
    category: "performance",
    triggers: {
      antiPatterns: ["n_plus_one", "eager_loading", "missing_index"],
      frameworks: ["express", "nestjs", "fastify"],
    },
    preferredTier: "balanced",
    minConfidence: 0.4,
    dependsOn: [],
    estimatedTokens: 4000,
    tags: ["performance", "optimization", "latency"],
    enabled: true,
  },
  {
    name: "testing-strategy",
    description: "Test coverage analysis and testing strategy recommendations",
    version: "1.0.0",
    category: "testing",
    triggers: {
      filePatterns: ["**/*.test.*", "**/*.spec.*", "**/jest.config.*"],
      scoreBelowThreshold: 60,
    },
    preferredTier: "balanced",
    minConfidence: 0.4,
    dependsOn: [],
    estimatedTokens: 3000,
    tags: ["testing", "coverage", "quality"],
    enabled: true,
  },
  {
    name: "compliance-review",
    description: "Regulatory compliance checks (GDPR, HIPAA, PCI-DSS, SOC2)",
    version: "1.0.0",
    category: "compliance",
    triggers: {
      domains: ["fintech" as Domain, "healthtech" as Domain],
      always: false,
    },
    preferredTier: "powerful",
    minConfidence: 0.5,
    dependsOn: ["security-review"],
    estimatedTokens: 6000,
    targetDomains: ["fintech" as Domain, "healthtech" as Domain],
    tags: ["compliance", "gdpr", "hipaa", "pci"],
    enabled: true,
  },
  {
    name: "database-review",
    description: "Database schema, query optimization, and migration analysis",
    version: "1.0.0",
    category: "database",
    triggers: {
      filePatterns: ["**/migrations/**", "**/schema.*", "**/prisma/**"],
      frameworks: ["prisma", "typeorm", "sequelize", "knex"],
    },
    preferredTier: "balanced",
    minConfidence: 0.4,
    dependsOn: [],
    estimatedTokens: 4000,
    tags: ["database", "sql", "migration", "schema"],
    enabled: true,
  },
];

/**
 * PersonaSystem — Expandable agent personas with role-specific context injection
 *
 * Inspired by claude-octopus AGENTS.md (32 personas + tool policies).
 * Each persona has expertise, tool permissions, context injection, and tier preference.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ToolPolicy = "read-only" | "read-search" | "read-exec" | "full";

export interface Persona {
  id: string;
  name: string;
  role: string;
  expertise: string[];
  systemPrompt: string;
  toolPolicy: ToolPolicy;
  preferredTier: "fast" | "balanced" | "powerful";
  contextInjections: ContextInjection[];
  enabled: boolean;
  tags: string[];
}

export interface ContextInjection {
  trigger: "always" | "on-match";
  matchPatterns?: string[];    // keywords that trigger injection
  content: string;             // injected into context
  position: "prepend" | "append";
}

export interface PersonaMatch {
  persona: Persona;
  relevanceScore: number;       // 0.0-1.0
  matchedExpertise: string[];
}

// ═══════════════════════════════════════════════════════════════
// BUILT-IN PERSONAS (inspired by Octopus's 32 agents)
// ═══════════════════════════════════════════════════════════════

export const BUILT_IN_PERSONAS: Persona[] = [
  // Security cluster
  {
    id: "security-auditor", name: "Security Auditor", role: "verifier",
    expertise: ["owasp", "cve", "authentication", "authorization", "encryption", "xss", "csrf", "sql-injection", "secrets"],
    systemPrompt: "You are a security auditor. Focus on vulnerabilities, OWASP Top 10, authentication flaws, and data exposure risks. Be paranoid — assume all input is malicious.",
    toolPolicy: "read-search", preferredTier: "powerful", enabled: true,
    tags: ["security", "compliance"],
    contextInjections: [{ trigger: "always", content: "SECURITY CONTEXT: Treat all external inputs as untrusted. Check for injection, XSS, CSRF, auth bypass, secrets in code, and insecure defaults.", position: "prepend" }],
  },
  {
    id: "penetration-tester", name: "Penetration Tester", role: "verifier",
    expertise: ["exploit", "attack-surface", "privilege-escalation", "lateral-movement", "social-engineering"],
    systemPrompt: "You are a penetration tester. Think like an attacker. Find ways to break, bypass, or exploit the system. Report attack vectors with severity and proof of concept.",
    toolPolicy: "read-exec", preferredTier: "powerful", enabled: true,
    tags: ["security", "offensive"],
    contextInjections: [],
  },

  // Architecture cluster
  {
    id: "backend-architect", name: "Backend Architect", role: "planner",
    expertise: ["system-design", "api-design", "database", "microservices", "event-driven", "cqrs", "ddd", "scalability"],
    systemPrompt: "You are a backend architect. Design for scalability, maintainability, and correctness. Consider failure modes, data consistency, and operational concerns.",
    toolPolicy: "read-search", preferredTier: "powerful", enabled: true,
    tags: ["architecture", "backend"],
    contextInjections: [{ trigger: "on-match", matchPatterns: ["database", "api", "microservice"], content: "ARCHITECTURE PRINCIPLES: SOLID, DDD bounded contexts, event-driven where appropriate, idempotent operations, circuit breakers for external calls.", position: "prepend" }],
  },
  {
    id: "frontend-architect", name: "Frontend Architect", role: "planner",
    expertise: ["react", "vue", "angular", "css", "accessibility", "performance", "state-management", "component-design"],
    systemPrompt: "You are a frontend architect. Design for user experience, accessibility, performance, and maintainability. Consider component composition, state management, and rendering optimization.",
    toolPolicy: "read-search", preferredTier: "balanced", enabled: true,
    tags: ["architecture", "frontend"],
    contextInjections: [],
  },
  {
    id: "data-architect", name: "Data Architect", role: "planner",
    expertise: ["data-modeling", "etl", "data-warehouse", "streaming", "schema-design", "migration", "normalization"],
    systemPrompt: "You are a data architect. Design data models for correctness, performance, and evolvability. Consider indexing, partitioning, migrations, and query patterns.",
    toolPolicy: "read-search", preferredTier: "balanced", enabled: true,
    tags: ["architecture", "data"],
    contextInjections: [],
  },

  // Implementation cluster
  {
    id: "senior-developer", name: "Senior Developer", role: "implementer",
    expertise: ["typescript", "python", "go", "rust", "clean-code", "testing", "refactoring", "patterns"],
    systemPrompt: "You are a senior developer. Write clean, tested, maintainable code. Follow SOLID principles. Prefer composition over inheritance. Every function should do one thing well.",
    toolPolicy: "full", preferredTier: "balanced", enabled: true,
    tags: ["development", "coding"],
    contextInjections: [],
  },
  {
    id: "test-engineer", name: "Test Engineer", role: "verifier",
    expertise: ["unit-testing", "integration-testing", "e2e", "tdd", "coverage", "mocking", "property-based"],
    systemPrompt: "You are a test engineer. Write comprehensive tests that catch real bugs. Focus on edge cases, error paths, and integration boundaries. Test behavior, not implementation.",
    toolPolicy: "read-exec", preferredTier: "balanced", enabled: true,
    tags: ["testing", "quality"],
    contextInjections: [],
  },

  // DevOps cluster
  {
    id: "devops-engineer", name: "DevOps Engineer", role: "implementer",
    expertise: ["ci-cd", "docker", "kubernetes", "terraform", "monitoring", "observability", "deployment"],
    systemPrompt: "You are a DevOps engineer. Automate everything. Design for reliability, observability, and fast recovery. Infrastructure as code. Blue-green deployments. Zero-downtime updates.",
    toolPolicy: "full", preferredTier: "balanced", enabled: true,
    tags: ["devops", "infrastructure"],
    contextInjections: [],
  },
  {
    id: "sre", name: "Site Reliability Engineer", role: "verifier",
    expertise: ["slo", "sli", "error-budget", "incident-response", "chaos-engineering", "capacity-planning", "runbook"],
    systemPrompt: "You are an SRE. Think in terms of SLOs, error budgets, and blast radius. Design for graceful degradation. Every system fails — plan for it.",
    toolPolicy: "read-exec", preferredTier: "balanced", enabled: true,
    tags: ["reliability", "operations"],
    contextInjections: [],
  },

  // Leadership cluster
  {
    id: "tech-lead", name: "Tech Lead", role: "planner",
    expertise: ["code-review", "mentoring", "technical-debt", "sprint-planning", "architecture-decisions", "team-velocity"],
    systemPrompt: "You are a tech lead. Balance delivery speed with code quality. Make pragmatic tradeoffs. Document decisions. Unblock the team. Ship iteratively.",
    toolPolicy: "read-search", preferredTier: "balanced", enabled: true,
    tags: ["leadership", "management"],
    contextInjections: [],
  },
  {
    id: "cto-advisor", name: "CTO Advisor", role: "planner",
    expertise: ["strategy", "build-vs-buy", "vendor-evaluation", "team-scaling", "technical-vision", "risk-management"],
    systemPrompt: "You are a CTO advisor. Think strategically about technology decisions. Consider total cost of ownership, team capabilities, market timing, and technical risk. Balance innovation with stability.",
    toolPolicy: "read-only", preferredTier: "powerful", enabled: true,
    tags: ["leadership", "strategy"],
    contextInjections: [],
  },

  // Adversarial cluster
  {
    id: "devils-advocate", name: "Devil's Advocate", role: "reviewer",
    expertise: ["critical-thinking", "assumption-challenging", "risk-identification", "alternative-solutions"],
    systemPrompt: "You are a devil's advocate. Challenge every assumption. Find the weakest point. Ask 'what if this fails?' for every decision. Propose alternatives that no one considered.",
    toolPolicy: "read-only", preferredTier: "powerful", enabled: true,
    tags: ["adversarial", "review"],
    contextInjections: [{ trigger: "always", content: "YOUR MISSION: Find flaws, challenge assumptions, identify risks. Be constructively critical. Every design has weaknesses — find them before production does.", position: "prepend" }],
  },
];

// ═══════════════════════════════════════════════════════════════
// PERSONA SYSTEM
// ═══════════════════════════════════════════════════════════════

export class PersonaSystem {
  private personas: Map<string, Persona> = new Map();

  constructor(personas?: Persona[]) {
    const initial = personas ?? BUILT_IN_PERSONAS;
    for (const p of initial) {
      this.personas.set(p.id, p);
    }
  }

  /** Register a new persona */
  register(persona: Persona): void {
    this.personas.set(persona.id, persona);
  }

  /** Remove a persona */
  unregister(id: string): void {
    this.personas.delete(id);
  }

  /** Get persona by ID */
  get(id: string): Persona | undefined {
    return this.personas.get(id);
  }

  /** List all personas, optionally filtered */
  list(filter?: { role?: string; tag?: string; enabled?: boolean }): Persona[] {
    let all = [...this.personas.values()];
    if (filter?.role) all = all.filter(p => p.role === filter.role);
    if (filter?.tag) all = all.filter(p => p.tags.includes(filter.tag!));
    if (filter?.enabled !== undefined) all = all.filter(p => p.enabled === filter.enabled);
    return all;
  }

  /** Find best personas matching a task description */
  matchPersonas(taskDescription: string, maxResults: number = 3): PersonaMatch[] {
    const lower = taskDescription.toLowerCase();
    const matches: PersonaMatch[] = [];

    for (const persona of this.personas.values()) {
      if (!persona.enabled) continue;

      const matchedExpertise = persona.expertise.filter(e => lower.includes(e));
      if (matchedExpertise.length === 0) continue;

      const relevanceScore = Math.min(1.0, matchedExpertise.length / Math.max(3, persona.expertise.length) + 0.2);
      matches.push({ persona, relevanceScore, matchedExpertise });
    }

    return matches
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);
  }

  /** Build context-injected prompt for a persona */
  buildPrompt(personaId: string, userPrompt: string): string {
    const persona = this.personas.get(personaId);
    if (!persona) return userPrompt;

    const parts: string[] = [];
    const lower = userPrompt.toLowerCase();

    // System prompt
    parts.push(`[PERSONA: ${persona.name} — ${persona.role}]`);
    parts.push(persona.systemPrompt);

    // Context injections
    for (const injection of persona.contextInjections) {
      if (injection.trigger === "always") {
        if (injection.position === "prepend") {
          parts.unshift(injection.content);
        } else {
          parts.push(injection.content);
        }
      } else if (injection.trigger === "on-match") {
        if (injection.matchPatterns?.some(p => lower.includes(p))) {
          parts.push(injection.content);
        }
      }
    }

    parts.push(`\n---\n${userPrompt}`);
    return parts.join("\n\n");
  }

  /** Get tool policy for a persona (for RBAC enforcement) */
  getToolPolicy(personaId: string): ToolPolicy {
    return this.personas.get(personaId)?.toolPolicy ?? "read-only";
  }

  /** Get preferred model tier for a persona */
  getPreferredTier(personaId: string): "fast" | "balanced" | "powerful" {
    return this.personas.get(personaId)?.preferredTier ?? "balanced";
  }

  get count(): number {
    return this.personas.size;
  }
}

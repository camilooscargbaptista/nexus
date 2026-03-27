/**
 * @nexus/core — Query Planner
 *
 * Decompõe objetivos complexos em steps executáveis via DAG.
 * Usa pattern matching + templates para decomposição,
 * com fallback single-step para objetivos simples.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface PlanStep {
  id: string;
  action: string;
  description: string;
  dependencies: string[];
  inputs: string[];
  outputs: string[];
  estimatedTokens: number;
}

export interface ExecutionPlan {
  objective: string;
  steps: PlanStep[];
  totalEstimatedTokens: number;
  complexity: "simple" | "moderate" | "complex";
  decompositionMethod: "pattern" | "single-step";
}

export interface PlannerContext {
  /** Frameworks detectados no projeto */
  frameworks?: string[];
  /** Domínio do projeto */
  domain?: string;
  /** Skills disponíveis */
  availableSkills?: string[];
  /** Constraints (ex: "no external deps", "must be async") */
  constraints?: string[];
}

interface DecompositionRule {
  /** Pattern para match no objetivo */
  patterns: RegExp[];
  /** Template de steps para gerar */
  template: (objective: string, context?: PlannerContext) => PlanStep[];
}

// ═══════════════════════════════════════════════════════════════
// QUERY PLANNER
// ═══════════════════════════════════════════════════════════════

/**
 * Decompõe objetivos em planos de execução.
 *
 * @example
 * ```ts
 * const planner = new QueryPlanner();
 * const plan = planner.plan("analyze security and performance of the API");
 * // plan.steps = [
 * //   { action: "analyze-security", ... },
 * //   { action: "analyze-performance", ... },
 * //   { action: "merge-report", deps: ["analyze-security", "analyze-performance"] }
 * // ]
 * ```
 */
export class QueryPlanner {
  private rules: DecompositionRule[] = DEFAULT_RULES;

  /**
   * Adiciona regras customizadas de decomposição.
   */
  addRule(rule: DecompositionRule): void {
    this.rules.unshift(rule); // Custom rules have priority
  }

  /**
   * Decompõe um objetivo em um plano de execução.
   */
  plan(objective: string, context?: PlannerContext): ExecutionPlan {
    const normalized = objective.toLowerCase().trim();

    // Try pattern-based decomposition
    for (const rule of this.rules) {
      if (rule.patterns.some((p) => p.test(normalized))) {
        const steps = rule.template(objective, context);
        if (steps.length > 0) {
          return {
            objective,
            steps,
            totalEstimatedTokens: steps.reduce((s, step) => s + step.estimatedTokens, 0),
            complexity: steps.length <= 2 ? "simple" : steps.length <= 5 ? "moderate" : "complex",
            decompositionMethod: "pattern",
          };
        }
      }
    }

    // Fallback: single-step plan
    return this.singleStepPlan(objective);
  }

  /**
   * Fallback — plano com um único step.
   */
  private singleStepPlan(objective: string): ExecutionPlan {
    const step: PlanStep = {
      id: "step-1",
      action: "execute",
      description: objective,
      dependencies: [],
      inputs: ["objective"],
      outputs: ["result"],
      estimatedTokens: 3000,
    };

    return {
      objective,
      steps: [step],
      totalEstimatedTokens: 3000,
      complexity: "simple",
      decompositionMethod: "single-step",
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// DEFAULT DECOMPOSITION RULES
// ═══════════════════════════════════════════════════════════════

const DEFAULT_RULES: DecompositionRule[] = [
  // "analyze X and Y" → parallel analysis + merge
  {
    patterns: [/\banalyz\w*\b.+\band\b/i, /\breview\b.+\band\b/i],
    template: (objective) => {
      const parts = objective
        .replace(/^(analyze|review)\s+/i, "")
        .split(/\s+and\s+/i)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      if (parts.length < 2) return [];

      const analyzeSteps: PlanStep[] = parts.map((part, i) => ({
        id: `analyze-${i + 1}`,
        action: `analyze-${part.replace(/\s+/g, "-").toLowerCase()}`,
        description: `Analyze ${part}`,
        dependencies: [],
        inputs: [part],
        outputs: [`${part}-report`],
        estimatedTokens: 3000,
      }));

      const mergeStep: PlanStep = {
        id: "merge-report",
        action: "merge-reports",
        description: "Merge analysis results into unified report",
        dependencies: analyzeSteps.map((s) => s.id),
        inputs: analyzeSteps.map((s) => `${s.outputs[0]}`),
        outputs: ["unified-report"],
        estimatedTokens: 2000,
      };

      return [...analyzeSteps, mergeStep];
    },
  },

  // "fix/refactor X" → analyze → plan → implement → verify
  {
    patterns: [/\b(fix|refactor|migrate|upgrade)\b/i],
    template: (objective) => [
      {
        id: "analyze",
        action: "analyze-current-state",
        description: `Analyze current state before: ${objective}`,
        dependencies: [],
        inputs: ["codebase"],
        outputs: ["analysis-report"],
        estimatedTokens: 3000,
      },
      {
        id: "plan",
        action: "create-action-plan",
        description: "Create detailed action plan based on analysis",
        dependencies: ["analyze"],
        inputs: ["analysis-report"],
        outputs: ["action-plan"],
        estimatedTokens: 2000,
      },
      {
        id: "implement",
        action: "implement-changes",
        description: `Implement: ${objective}`,
        dependencies: ["plan"],
        inputs: ["action-plan"],
        outputs: ["changes"],
        estimatedTokens: 5000,
      },
      {
        id: "verify",
        action: "verify-changes",
        description: "Verify changes and run tests",
        dependencies: ["implement"],
        inputs: ["changes"],
        outputs: ["verification-report"],
        estimatedTokens: 2000,
      },
    ],
  },

  // "compare X with/vs Y" → analyze both + compare
  {
    patterns: [/\bcompare\b.+\b(with|vs|versus|against)\b/i],
    template: (objective) => {
      const match = objective.match(/compare\s+(.+?)\s+(?:with|vs|versus|against)\s+(.+)/i);
      if (!match) return [];
      const [, a, b] = match;

      return [
        {
          id: "analyze-a",
          action: `analyze-${a!.replace(/\s+/g, "-").toLowerCase()}`,
          description: `Analyze ${a}`,
          dependencies: [],
          inputs: [a!],
          outputs: ["analysis-a"],
          estimatedTokens: 3000,
        },
        {
          id: "analyze-b",
          action: `analyze-${b!.replace(/\s+/g, "-").toLowerCase()}`,
          description: `Analyze ${b}`,
          dependencies: [],
          inputs: [b!],
          outputs: ["analysis-b"],
          estimatedTokens: 3000,
        },
        {
          id: "compare",
          action: "compare-results",
          description: `Compare ${a} vs ${b}`,
          dependencies: ["analyze-a", "analyze-b"],
          inputs: ["analysis-a", "analysis-b"],
          outputs: ["comparison-report"],
          estimatedTokens: 2000,
        },
      ];
    },
  },

  // "test/validate X" → analyze → generate tests → validate
  {
    patterns: [/\b(test|validate|verify)\b/i],
    template: (objective) => [
      {
        id: "analyze",
        action: "analyze-target",
        description: `Analyze target for: ${objective}`,
        dependencies: [],
        inputs: ["target"],
        outputs: ["analysis"],
        estimatedTokens: 2000,
      },
      {
        id: "generate",
        action: "generate-tests",
        description: "Generate test cases",
        dependencies: ["analyze"],
        inputs: ["analysis"],
        outputs: ["test-suite"],
        estimatedTokens: 3000,
      },
      {
        id: "validate",
        action: "run-validation",
        description: "Run validation and report results",
        dependencies: ["generate"],
        inputs: ["test-suite"],
        outputs: ["validation-report"],
        estimatedTokens: 2000,
      },
    ],
  },
];

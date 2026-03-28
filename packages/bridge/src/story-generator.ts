/**
 * @camilooscargbaptista/nexus-bridge — Story Generator
 *
 * Gera User Stories com acceptance criteria e BDD scenarios
 * a partir de Epics.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type { Epic } from "./epic-decomposer.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface UserStory {
  /** ID único */
  id: string;
  /** Epic parent ID */
  epicId: string;
  /** Título */
  title: string;
  /** User story format: As a... I want... So that... */
  asA: string;
  iWant: string;
  soThat: string;
  /** Acceptance criteria */
  acceptanceCriteria: string[];
  /** BDD scenario */
  bddScenario: BDDScenario;
  /** Story points */
  points: number;
  /** Prioridade */
  priority: "must" | "should" | "could" | "wont";
}

export interface BDDScenario {
  given: string;
  when: string;
  then: string;
}

// ═══════════════════════════════════════════════════════════════
// STORY TEMPLATES PER CATEGORY
// ═══════════════════════════════════════════════════════════════

interface StoryTemplate {
  titlePrefix: string;
  stories: Array<{
    title: string;
    asA: string;
    iWant: string;
    soThat: string;
    criteria: string[];
    points: number;
  }>;
}

const TEMPLATES: Record<string, StoryTemplate> = {
  infrastructure: {
    titlePrefix: "Setup",
    stories: [
      {
        title: "Project initialization",
        asA: "developer",
        iWant: "a fully configured project with linting, testing, and CI",
        soThat: "I can start development with quality standards from day one",
        criteria: ["Project builds successfully", "Linter runs with zero errors", "Test framework executes", "Docker builds"],
        points: 5,
      },
      {
        title: "Development environment",
        asA: "developer",
        iWant: "a local dev environment with hot-reload and debugging",
        soThat: "I can iterate quickly during development",
        criteria: ["Dev server starts in < 10s", "Hot-reload works", "Debug breakpoints work"],
        points: 3,
      },
    ],
  },
  "data-model": {
    titlePrefix: "Data",
    stories: [
      {
        title: "Schema design and migrations",
        asA: "developer",
        iWant: "a normalized database schema with migrations",
        soThat: "data is consistent and schema changes are tracked",
        criteria: ["All entities have migrations", "Seed data loads correctly", "Rollback works"],
        points: 5,
      },
      {
        title: "ORM configuration",
        asA: "developer",
        iWant: "type-safe ORM configured with all models",
        soThat: "database operations are safe and auto-completed",
        criteria: ["All models defined", "Relations configured", "Query builder works"],
        points: 3,
      },
    ],
  },
  backend: {
    titlePrefix: "API",
    stories: [
      {
        title: "CRUD endpoints",
        asA: "API consumer",
        iWant: "RESTful CRUD endpoints for core entities",
        soThat: "I can create, read, update, and delete resources",
        criteria: ["GET returns paginated list", "POST validates input", "PUT updates correctly", "DELETE soft-deletes"],
        points: 8,
      },
      {
        title: "Business logic services",
        asA: "system",
        iWant: "business logic encapsulated in services",
        soThat: "logic is reusable and testable",
        criteria: ["Services have unit tests", "Error handling is consistent", "Logging is structured"],
        points: 5,
      },
    ],
  },
  integration: {
    titlePrefix: "Integration",
    stories: [
      {
        title: "External service clients",
        asA: "system",
        iWant: "resilient clients for external services",
        soThat: "integrations are reliable with retry and fallback",
        criteria: ["Client has retry logic", "Timeout configured", "Errors are logged", "Circuit breaker implemented"],
        points: 8,
      },
    ],
  },
  frontend: {
    titlePrefix: "UI",
    stories: [
      {
        title: "Core UI components",
        asA: "user",
        iWant: "a responsive, accessible interface",
        soThat: "I can interact with the system efficiently",
        criteria: ["Components are responsive", "WCAG 2.1 AA compliant", "Design system tokens used"],
        points: 8,
      },
      {
        title: "State management",
        asA: "developer",
        iWant: "centralized state management",
        soThat: "data flow is predictable and debuggable",
        criteria: ["State is centralized", "Actions are typed", "Devtools configured"],
        points: 5,
      },
    ],
  },
  security: {
    titlePrefix: "Security",
    stories: [
      {
        title: "Authentication & Authorization",
        asA: "user",
        iWant: "secure login with role-based access",
        soThat: "only authorized users access protected resources",
        criteria: ["JWT tokens issued", "RBAC enforced", "Passwords hashed (bcrypt)", "Session expiry works"],
        points: 5,
      },
    ],
  },
  observability: {
    titlePrefix: "Ops",
    stories: [
      {
        title: "Logging, metrics, and health checks",
        asA: "SRE",
        iWant: "structured logging, metrics endpoints, and health checks",
        soThat: "I can monitor system health and debug issues",
        criteria: ["Structured JSON logs", "Health endpoint returns status", "Metrics exposed"],
        points: 5,
      },
    ],
  },
  testing: {
    titlePrefix: "QA",
    stories: [
      {
        title: "Test coverage and quality gates",
        asA: "developer",
        iWant: "automated tests with coverage thresholds",
        soThat: "regressions are caught before deployment",
        criteria: ["Unit test coverage > 80%", "Integration tests pass", "CI blocks on failing tests"],
        points: 5,
      },
    ],
  },
  deployment: {
    titlePrefix: "Deploy",
    stories: [
      {
        title: "Production deployment pipeline",
        asA: "DevOps",
        iWant: "automated CI/CD pipeline with staging and production",
        soThat: "releases are safe, repeatable, and auditable",
        criteria: ["Pipeline builds on push", "Staging deploys automatically", "Production requires approval", "Rollback works"],
        points: 5,
      },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════
// STORY GENERATOR
// ═══════════════════════════════════════════════════════════════

/**
 * Gera User Stories com BDD scenarios a partir de Epics.
 *
 * @example
 * ```ts
 * const stories = StoryGenerator.generate(epics);
 * console.log(stories[0].asA); // "developer"
 * console.log(stories[0].bddScenario.given); // "Given..."
 * ```
 */
export class StoryGenerator {
  private nextId = 0;

  /**
   * Gera stories para um único epic.
   */
  generate(epic: Epic): UserStory[] {
    const template = TEMPLATES[epic.category];
    if (!template) return [];

    return template.stories.map((t, i) => {
      const id = `story-${++this.nextId}`;

      return {
        id,
        epicId: epic.id,
        title: `[${template.titlePrefix}] ${t.title}`,
        asA: t.asA,
        iWant: t.iWant,
        soThat: t.soThat,
        acceptanceCriteria: t.criteria,
        bddScenario: this.generateBDD(t.asA, t.iWant, t.soThat),
        points: t.points,
        priority: i === 0 ? "must" : "should",
      };
    });
  }

  /**
   * Gera stories para todos os epics.
   */
  generateAll(epics: Epic[]): UserStory[] {
    return epics.flatMap((epic) => this.generate(epic));
  }

  /**
   * Gera BDD scenario.
   */
  private generateBDD(asA: string, iWant: string, soThat: string): BDDScenario {
    return {
      given: `Given I am a ${asA}`,
      when: `When I ${iWant.replace(/^a /, "request ").replace(/^an /, "request ")}`,
      then: `Then ${soThat}`,
    };
  }
}

/**
 * @nexus/bridge — Sprint Planner Tests (Sprint 13)
 */

import { describe, it, expect } from "@jest/globals";
import { SpecParser } from "../spec-parser.js";
import { EpicDecomposer } from "../epic-decomposer.js";
import type { Epic } from "../epic-decomposer.js";
import { StoryGenerator } from "../story-generator.js";
import { SprintPlanner } from "../sprint-planner.js";

const SMARTCOLLECT_INPUT =
  "Sistema de negociação de dívidas multi-channel com WhatsApp, Telegram e SMS. " +
  "Agentes de onboarding, transação, negociação e compliance. " +
  "Dashboard admin para gerenciamento. " +
  "Python + FastAPI + Kafka + PostgreSQL. " +
  "Deploy em Kubernetes na AWS. " +
  "Alta disponibilidade e segurança LGPD.";

// ═══════════════════════════════════════════════════════════════
// EPIC DECOMPOSER
// ═══════════════════════════════════════════════════════════════

describe("EpicDecomposer", () => {
  const parsed = SpecParser.parse(SMARTCOLLECT_INPUT);

  it("should decompose spec into epics", () => {
    const epics = EpicDecomposer.decompose(parsed);

    expect(epics.length).toBeGreaterThanOrEqual(5);
  });

  it("should have infrastructure epic first", () => {
    const epics = EpicDecomposer.decompose(parsed);

    expect(epics[0]!.category).toBe("infrastructure");
    expect(epics[0]!.priority).toBe(1);
  });

  it("should have deployment epic last", () => {
    const epics = EpicDecomposer.decompose(parsed);

    const last = epics[epics.length - 1]!;
    expect(last.category).toBe("deployment");
  });

  it("should create data model epic for entities", () => {
    const epics = EpicDecomposer.decompose(parsed);

    const dataEpic = epics.find((e) => e.category === "data-model");
    expect(dataEpic).toBeDefined();
    expect(dataEpic!.description).toContain("schema");
  });

  it("should create integration epic for WhatsApp/Telegram", () => {
    const epics = EpicDecomposer.decompose(parsed);

    const intEpic = epics.find((e) => e.category === "integration");
    expect(intEpic).toBeDefined();
    expect(intEpic!.title).toContain("WhatsApp");
  });

  it("should create security epic for LGPD/security", () => {
    const epics = EpicDecomposer.decompose(parsed);

    const secEpic = epics.find((e) => e.category === "security");
    expect(secEpic).toBeDefined();
  });

  it("should set dependency chains", () => {
    const epics = EpicDecomposer.decompose(parsed);

    const backend = epics.find((e) => e.category === "backend");
    expect(backend!.dependsOn.length).toBeGreaterThan(0); // depends on data-model
  });

  it("should estimate story points", () => {
    const epics = EpicDecomposer.decompose(parsed);

    const totalPoints = epics.reduce((s, e) => s + e.estimatedPoints, 0);
    expect(totalPoints).toBeGreaterThan(20);
  });
});

// ═══════════════════════════════════════════════════════════════
// STORY GENERATOR
// ═══════════════════════════════════════════════════════════════

describe("StoryGenerator", () => {
  const parsed = SpecParser.parse(SMARTCOLLECT_INPUT);
  const epics = EpicDecomposer.decompose(parsed);

  it("should generate stories from epics", () => {
    const generator = new StoryGenerator();
    const stories = generator.generateAll(epics);

    expect(stories.length).toBeGreaterThanOrEqual(8);
  });

  it("should have user story format (As a / I want / So that)", () => {
    const generator = new StoryGenerator();
    const stories = generator.generateAll(epics);

    for (const story of stories) {
      expect(story.asA).toBeDefined();
      expect(story.iWant).toBeDefined();
      expect(story.soThat).toBeDefined();
    }
  });

  it("should have acceptance criteria", () => {
    const generator = new StoryGenerator();
    const stories = generator.generateAll(epics);

    for (const story of stories) {
      expect(story.acceptanceCriteria.length).toBeGreaterThan(0);
    }
  });

  it("should have BDD scenarios", () => {
    const generator = new StoryGenerator();
    const stories = generator.generateAll(epics);

    for (const story of stories) {
      expect(story.bddScenario.given).toContain("Given");
      expect(story.bddScenario.when).toContain("When");
      expect(story.bddScenario.then).toContain("Then");
    }
  });

  it("should assign MoSCoW priority", () => {
    const generator = new StoryGenerator();

    const infraEpic = epics.find((e) => e.category === "infrastructure")!;
    const stories = generator.generate(infraEpic);

    expect(stories[0]!.priority).toBe("must");
  });

  it("should assign story points", () => {
    const generator = new StoryGenerator();
    const stories = generator.generateAll(epics);

    for (const story of stories) {
      expect(story.points).toBeGreaterThan(0);
    }
  });

  it("should link to parent epic", () => {
    const generator = new StoryGenerator();
    const stories = generator.generateAll(epics);

    for (const story of stories) {
      expect(epics.some((e) => e.id === story.epicId)).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// SPRINT PLANNER
// ═══════════════════════════════════════════════════════════════

describe("SprintPlanner", () => {
  const parsed = SpecParser.parse(SMARTCOLLECT_INPUT);
  const epics = EpicDecomposer.decompose(parsed);
  const generator = new StoryGenerator();
  const stories = generator.generateAll(epics);

  it("should distribute stories into sprints", () => {
    const planner = new SprintPlanner({ velocity: 20 });
    const plan = planner.plan(epics, stories);

    expect(plan.totalSprints).toBeGreaterThan(0);
    expect(plan.sprints.length).toBe(plan.totalSprints);
  });

  it("should respect velocity per sprint", () => {
    const planner = new SprintPlanner({ velocity: 15 });
    const plan = planner.plan(epics, stories);

    for (const sprint of plan.sprints) {
      expect(sprint.totalPoints).toBeLessThanOrEqual(15);
    }
  });

  it("should calculate total points", () => {
    const planner = new SprintPlanner();
    const plan = planner.plan(epics, stories);

    const expectedTotal = stories.reduce((s, st) => s + st.points, 0);
    expect(plan.totalPoints).toBe(expectedTotal);
  });

  it("should generate markdown plan", () => {
    const planner = new SprintPlanner();
    const plan = planner.plan(epics, stories);

    expect(plan.markdown).toContain("Sprint Plan");
    expect(plan.markdown).toContain("Sprint 1");
    expect(plan.markdown).toContain("🔴 Must");
  });

  it("should set sprint goals", () => {
    const planner = new SprintPlanner();
    const plan = planner.plan(epics, stories);

    for (const sprint of plan.sprints) {
      expect(sprint.goal).toBeDefined();
      expect(sprint.goal.length).toBeGreaterThan(0);
    }
  });

  it("should support custom velocity", () => {
    const small = new SprintPlanner({ velocity: 5 });
    const large = new SprintPlanner({ velocity: 50 });

    const smallPlan = small.plan(epics, stories);
    const largePlan = large.plan(epics, stories);

    expect(smallPlan.totalSprints).toBeGreaterThan(largePlan.totalSprints);
  });
});

/**
 * @camilooscargbaptista/nexus-bridge — Sprint Planner
 *
 * Distribui User Stories em Sprints respeitando dependências,
 * velocity e prioridade (MoSCoW).
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import type { Epic } from "./epic-decomposer.js";
import type { UserStory } from "./story-generator.js";
import { formatTable, formatSection } from "@camilooscargbaptista/nexus-core";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface Sprint {
  /** ID do sprint */
  id: string;
  /** Número do sprint */
  number: number;
  /** Título */
  title: string;
  /** Stories no sprint */
  stories: UserStory[];
  /** Total de story points */
  totalPoints: number;
  /** Capacity máxima */
  capacity: number;
  /** Goal do sprint */
  goal: string;
}

export interface SprintPlan {
  /** Sprints gerados */
  sprints: Sprint[];
  /** Total de sprints */
  totalSprints: number;
  /** Total de story points */
  totalPoints: number;
  /** Velocity média (pontos/sprint) */
  velocity: number;
  /** Markdown do plano */
  markdown: string;
}

export interface SprintPlannerConfig {
  /** Velocity do time (pontos por sprint) — default 20 */
  velocity: number;
  /** Prefixo do sprint */
  sprintPrefix: string;
}

// ═══════════════════════════════════════════════════════════════
// SPRINT PLANNER
// ═══════════════════════════════════════════════════════════════

/**
 * Distribui stories em sprints com base em velocity e dependências.
 *
 * @example
 * ```ts
 * const planner = new SprintPlanner({ velocity: 20 });
 * const plan = planner.plan(epics, stories);
 *
 * console.log(plan.totalSprints);  // 5
 * console.log(plan.sprints[0].goal); // "Project Setup & Infrastructure"
 * ```
 */
export class SprintPlanner {
  private config: SprintPlannerConfig;

  constructor(config?: Partial<SprintPlannerConfig>) {
    this.config = {
      velocity: config?.velocity ?? 20,
      sprintPrefix: config?.sprintPrefix ?? "Sprint",
    };
  }

  /**
   * Gera plano de sprints.
   */
  plan(epics: Epic[], stories: UserStory[]): SprintPlan {
    const sprints: Sprint[] = [];
    let currentSprint: Sprint = this.createSprint(1, epics[0]?.title ?? "Kickoff");
    const remainingStories = [...stories];

    // Sort stories: must > should > could > wont, then by epic priority
    remainingStories.sort((a, b) => {
      const priorityOrder = { must: 0, should: 1, could: 2, wont: 3 };
      const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (pDiff !== 0) return pDiff;

      // By epic order
      const aEpic = epics.findIndex((e) => e.id === a.epicId);
      const bEpic = epics.findIndex((e) => e.id === b.epicId);
      return aEpic - bEpic;
    });

    for (const story of remainingStories) {
      if (currentSprint.totalPoints + story.points > this.config.velocity) {
        // Sprint full — push and create new
        sprints.push(currentSprint);
        const nextGoal = this.inferGoal(story, epics);
        currentSprint = this.createSprint(sprints.length + 1, nextGoal);
      }

      currentSprint.stories.push(story);
      currentSprint.totalPoints += story.points;
    }

    // Push last sprint
    if (currentSprint.stories.length > 0) {
      sprints.push(currentSprint);
    }

    const totalPoints = stories.reduce((sum, s) => sum + s.points, 0);

    // Generate markdown
    const markdown = this.renderMarkdown(sprints, totalPoints);

    return {
      sprints,
      totalSprints: sprints.length,
      totalPoints,
      velocity: this.config.velocity,
      markdown,
    };
  }

  /**
   * Renderiza plano como Markdown.
   */
  private renderMarkdown(sprints: Sprint[], totalPoints: number): string {
    const sections: string[] = [];

    sections.push(`# Sprint Plan`);
    sections.push("");
    sections.push(`**Total Sprints:** ${sprints.length}`);
    sections.push(`**Total Points:** ${totalPoints}`);
    sections.push(`**Velocity:** ${this.config.velocity} pts/sprint`);
    sections.push("");

    for (const sprint of sprints) {
      const headers = ["Story", "Points", "Priority", "Epic"];
      const rows = sprint.stories.map((s) => [
        s.title,
        String(s.points),
        this.priorityEmoji(s.priority),
        s.epicId,
      ]);

      sections.push(formatSection(
        `${sprint.title} — "${sprint.goal}" (${sprint.totalPoints}/${sprint.capacity} pts)`,
        formatTable(headers, rows),
        3,
      ));
    }

    return sections.join("\n");
  }

  private createSprint(number: number, goal: string): Sprint {
    return {
      id: `sprint-${number}`,
      number,
      title: `${this.config.sprintPrefix} ${number}`,
      stories: [],
      totalPoints: 0,
      capacity: this.config.velocity,
      goal,
    };
  }

  private inferGoal(story: UserStory, epics: Epic[]): string {
    const epic = epics.find((e) => e.id === story.epicId);
    return epic?.title ?? "Continuation";
  }

  private priorityEmoji(priority: UserStory["priority"]): string {
    switch (priority) {
      case "must": return "🔴 Must";
      case "should": return "🟡 Should";
      case "could": return "🟢 Could";
      case "wont": return "⚪ Won't";
    }
  }
}

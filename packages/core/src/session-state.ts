/**
 * SessionState — Persistent cross-session state machine
 *
 * Inspired by claude-octopus state-manager.sh.
 * Maintains deterministic state transitions, persists across sessions,
 * and provides observable state history.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type SessionPhase =
  | "idle" | "discover" | "define" | "develop" | "deliver"
  | "review" | "remediate" | "complete" | "failed";

export interface SessionSnapshot {
  id: string;
  phase: SessionPhase;
  projectId: string;
  startedAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
  decisions: Decision[];
  observations: Observation[];
  phaseHistory: PhaseTransition[];
}

export interface Decision {
  id: string;
  phase: SessionPhase;
  title: string;
  description: string;
  importance: number;            // 1-10
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface Observation {
  id: string;
  phase: SessionPhase;
  type: "finding" | "insight" | "warning" | "metric";
  content: string;
  importance: number;            // 1-10
  keywords: string[];
  timestamp: Date;
}

export interface PhaseTransition {
  from: SessionPhase;
  to: SessionPhase;
  reason: string;
  timestamp: Date;
}

/** External dependency: persists state across sessions */
export interface StateStore {
  save(state: SessionSnapshot): Promise<void>;
  load(sessionId: string): Promise<SessionSnapshot | null>;
  list(projectId: string): Promise<SessionSnapshot[]>;
}

// ═══════════════════════════════════════════════════════════════
// VALID TRANSITIONS (deterministic state machine)
// ═══════════════════════════════════════════════════════════════

const VALID_TRANSITIONS: Record<SessionPhase, SessionPhase[]> = {
  idle: ["discover", "define", "develop", "review"],
  discover: ["define", "review", "failed"],
  define: ["develop", "review", "failed"],
  develop: ["deliver", "review", "remediate", "failed"],
  deliver: ["complete", "remediate", "failed"],
  review: ["develop", "remediate", "complete", "failed"],
  remediate: ["develop", "deliver", "review", "failed"],
  complete: ["idle"],  // can start new cycle
  failed: ["idle", "remediate"],
};

// ═══════════════════════════════════════════════════════════════
// SESSION STATE MACHINE
// ═══════════════════════════════════════════════════════════════

let stateCounter = 0;

export class SessionStateMachine {
  private state: SessionSnapshot;

  constructor(
    private readonly store: StateStore,
    projectId: string,
    sessionId?: string,
  ) {
    this.state = {
      id: sessionId ?? `session-${Date.now()}-${++stateCounter}`,
      phase: "idle",
      projectId,
      startedAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
      decisions: [],
      observations: [],
      phaseHistory: [],
    };
  }

  /** Transition to a new phase (validates transition is allowed) */
  transition(to: SessionPhase, reason: string): void {
    const allowed = VALID_TRANSITIONS[this.state.phase];
    if (!allowed?.includes(to)) {
      throw new Error(
        `Invalid transition: ${this.state.phase} → ${to}. Allowed: ${allowed?.join(", ") ?? "none"}`,
      );
    }

    this.state.phaseHistory.push({
      from: this.state.phase,
      to,
      reason,
      timestamp: new Date(),
    });

    this.state.phase = to;
    this.state.updatedAt = new Date();
  }

  /** Record a decision made during current phase */
  recordDecision(title: string, description: string, importance: number = 5): void {
    this.state.decisions.push({
      id: `decision-${this.state.decisions.length + 1}`,
      phase: this.state.phase,
      title,
      description,
      importance: Math.min(10, Math.max(1, importance)),
      timestamp: new Date(),
    });
    this.state.updatedAt = new Date();
  }

  /** Record an observation (finding, insight, warning, metric) */
  recordObservation(
    type: Observation["type"],
    content: string,
    keywords: string[],
    importance: number = 5,
  ): void {
    this.state.observations.push({
      id: `obs-${this.state.observations.length + 1}`,
      phase: this.state.phase,
      type,
      content,
      importance: Math.min(10, Math.max(1, importance)),
      keywords,
      timestamp: new Date(),
    });
    this.state.updatedAt = new Date();
  }

  /** Set metadata key */
  setMetadata(key: string, value: unknown): void {
    this.state.metadata[key] = value;
    this.state.updatedAt = new Date();
  }

  /** Search observations by keywords and min importance */
  searchObservations(keywords: string[], minImportance: number = 1): Observation[] {
    return this.state.observations.filter(obs => {
      if (obs.importance <= minImportance) return false;
      if (keywords.length === 0) return true;
      return keywords.some(kw => obs.keywords.includes(kw) || obs.content.toLowerCase().includes(kw));
    });
  }

  /** Get decisions for a specific phase */
  getDecisions(phase?: SessionPhase): Decision[] {
    if (!phase) return [...this.state.decisions];
    return this.state.decisions.filter(d => d.phase === phase);
  }

  /** Persist current state to store */
  async save(): Promise<void> {
    await this.store.save(this.state);
  }

  /** Restore state from store */
  async restore(sessionId: string): Promise<boolean> {
    const saved = await this.store.load(sessionId);
    if (!saved) return false;
    this.state = saved;
    return true;
  }

  /** Get current snapshot (immutable copy) */
  getSnapshot(): Readonly<SessionSnapshot> {
    return {
      ...this.state,
      metadata: { ...this.state.metadata },
      decisions: [...this.state.decisions],
      observations: [...this.state.observations],
      phaseHistory: [...this.state.phaseHistory],
    };
  }

  /** Get current phase */
  get phase(): SessionPhase {
    return this.state.phase;
  }

  /** Get session ID */
  get sessionId(): string {
    return this.state.id;
  }

  /** Get valid transitions from current phase */
  getValidTransitions(): SessionPhase[] {
    return VALID_TRANSITIONS[this.state.phase] ?? [];
  }

  /** Check if a transition is valid */
  canTransition(to: SessionPhase): boolean {
    return (VALID_TRANSITIONS[this.state.phase] ?? []).includes(to);
  }
}

// ═══════════════════════════════════════════════════════════════
// IN-MEMORY STATE STORE (for testing/development)
// ═══════════════════════════════════════════════════════════════

export class InMemoryStateStore implements StateStore {
  private states: Map<string, SessionSnapshot> = new Map();

  async save(state: SessionSnapshot): Promise<void> {
    this.states.set(state.id, {
      ...state,
      metadata: { ...state.metadata },
      decisions: [...state.decisions],
      observations: [...state.observations],
      phaseHistory: [...state.phaseHistory],
    });
  }

  async load(sessionId: string): Promise<SessionSnapshot | null> {
    return this.states.get(sessionId) ?? null;
  }

  async list(projectId: string): Promise<SessionSnapshot[]> {
    return [...this.states.values()]
      .filter(s => s.projectId === projectId)
      .map(s => ({
        ...s,
        metadata: { ...s.metadata },
        decisions: [...s.decisions],
        observations: [...s.observations],
        phaseHistory: [...s.phaseHistory],
      }));
  }
}

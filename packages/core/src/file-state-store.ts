/**
 * FileStateStore — Persistent filesystem-backed StateStore
 *
 * Saves session snapshots as JSON files under a configurable directory.
 * Each session gets its own file: {baseDir}/{sessionId}.json
 *
 * Supports trend tracking by loading historical sessions for comparison.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { StateStore, SessionSnapshot } from "./session-state.js";

export interface FileStateStoreConfig {
  /** Base directory for state files. Default: ".nexus/sessions" */
  baseDir: string;
  /** Pretty-print JSON (dev mode). Default: false */
  prettyPrint?: boolean;
  /** Max sessions to keep per project. Default: 200 */
  maxSessionsPerProject?: number;
}

export class FileStateStore implements StateStore {
  private readonly baseDir: string;
  private readonly prettyPrint: boolean;
  private readonly maxSessions: number;

  constructor(config: FileStateStoreConfig) {
    this.baseDir = resolve(config.baseDir);
    this.prettyPrint = config.prettyPrint ?? false;
    this.maxSessions = config.maxSessionsPerProject ?? 200;
    this.ensureDir(this.baseDir);
  }

  async save(state: SessionSnapshot): Promise<void> {
    const filePath = this.sessionPath(state.id);
    const serializable = this.toSerializable(state);
    const json = this.prettyPrint
      ? JSON.stringify(serializable, null, 2)
      : JSON.stringify(serializable);
    writeFileSync(filePath, json, "utf-8");
  }

  async load(sessionId: string): Promise<SessionSnapshot | null> {
    const filePath = this.sessionPath(sessionId);
    if (!existsSync(filePath)) return null;
    try {
      const raw = readFileSync(filePath, "utf-8");
      return this.fromSerializable(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async list(projectId: string): Promise<SessionSnapshot[]> {
    if (!existsSync(this.baseDir)) return [];

    const files = readdirSync(this.baseDir).filter((f) => f.endsWith(".json"));
    const sessions: SessionSnapshot[] = [];

    for (const file of files) {
      try {
        const raw = readFileSync(join(this.baseDir, file), "utf-8");
        const snapshot = this.fromSerializable(JSON.parse(raw));
        if (snapshot.projectId === projectId) {
          sessions.push(snapshot);
        }
      } catch {
        // Skip corrupted files
      }
    }

    // Sort by startedAt ascending
    sessions.sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());

    // Enforce max sessions limit
    if (sessions.length > this.maxSessions) {
      return sessions.slice(sessions.length - this.maxSessions);
    }

    return sessions;
  }

  /** Get the file path for a session */
  getSessionPath(sessionId: string): string {
    return this.sessionPath(sessionId);
  }

  /** Get the base directory */
  getBaseDir(): string {
    return this.baseDir;
  }

  // ── Private helpers ──────────────────────────────────────────

  private sessionPath(sessionId: string): string {
    // Sanitize ID for filesystem safety
    const safe = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.baseDir, `${safe}.json`);
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /** Convert SessionSnapshot dates to ISO strings for JSON serialization */
  private toSerializable(state: SessionSnapshot): Record<string, unknown> {
    return {
      ...state,
      startedAt: state.startedAt instanceof Date ? state.startedAt.toISOString() : state.startedAt,
      updatedAt: state.updatedAt instanceof Date ? state.updatedAt.toISOString() : state.updatedAt,
      decisions: state.decisions.map((d) => ({
        ...d,
        timestamp: d.timestamp instanceof Date ? d.timestamp.toISOString() : d.timestamp,
      })),
      observations: state.observations.map((o) => ({
        ...o,
        timestamp: o.timestamp instanceof Date ? o.timestamp.toISOString() : o.timestamp,
      })),
      phaseHistory: state.phaseHistory.map((p) => ({
        ...p,
        timestamp: p.timestamp instanceof Date ? p.timestamp.toISOString() : p.timestamp,
      })),
    };
  }

  /** Convert ISO strings back to Date objects when loading */
  private fromSerializable(raw: Record<string, unknown>): SessionSnapshot {
    const data = raw as any;
    return {
      ...data,
      startedAt: new Date(data.startedAt),
      updatedAt: new Date(data.updatedAt),
      decisions: (data.decisions ?? []).map((d: any) => ({
        ...d,
        timestamp: new Date(d.timestamp),
      })),
      observations: (data.observations ?? []).map((o: any) => ({
        ...o,
        timestamp: new Date(o.timestamp),
      })),
      phaseHistory: (data.phaseHistory ?? []).map((p: any) => ({
        ...p,
        timestamp: new Date(p.timestamp),
      })),
    };
  }
}

// ═══════════════════════════════════════════════════════════════
// TREND TRACKER — Analyzes historical sessions
// ═══════════════════════════════════════════════════════════════

export interface TrendPoint {
  sessionId: string;
  timestamp: Date;
  phase: string;
  decisionCount: number;
  observationCount: number;
  metadata: Record<string, unknown>;
}

export interface TrendAnalysis {
  projectId: string;
  totalSessions: number;
  firstRun: Date | null;
  lastRun: Date | null;
  averageDecisions: number;
  averageObservations: number;
  completionRate: number;  // % of sessions that reached "complete"
  failureRate: number;     // % of sessions that reached "failed"
  points: TrendPoint[];
}

export class TrendTracker {
  constructor(private store: FileStateStore) {}

  async analyze(projectId: string): Promise<TrendAnalysis> {
    const sessions = await this.store.list(projectId);

    if (sessions.length === 0) {
      return {
        projectId,
        totalSessions: 0,
        firstRun: null,
        lastRun: null,
        averageDecisions: 0,
        averageObservations: 0,
        completionRate: 0,
        failureRate: 0,
        points: [],
      };
    }

    const completed = sessions.filter((s) => s.phase === "complete").length;
    const failed = sessions.filter((s) => s.phase === "failed").length;
    const totalDecisions = sessions.reduce((sum, s) => sum + s.decisions.length, 0);
    const totalObs = sessions.reduce((sum, s) => sum + s.observations.length, 0);

    return {
      projectId,
      totalSessions: sessions.length,
      firstRun: sessions[0]!.startedAt,
      lastRun: sessions[sessions.length - 1]!.startedAt,
      averageDecisions: Math.round(totalDecisions / sessions.length),
      averageObservations: Math.round(totalObs / sessions.length),
      completionRate: Math.round((completed / sessions.length) * 100),
      failureRate: Math.round((failed / sessions.length) * 100),
      points: sessions.map((s) => ({
        sessionId: s.id,
        timestamp: s.startedAt,
        phase: s.phase,
        decisionCount: s.decisions.length,
        observationCount: s.observations.length,
        metadata: s.metadata,
      })),
    };
  }

  /** Compare two sessions and report delta */
  async compare(sessionIdA: string, sessionIdB: string): Promise<{
    decisionDelta: number;
    observationDelta: number;
    phaseDiff: { a: string; b: string };
  } | null> {
    const a = await this.store.load(sessionIdA);
    const b = await this.store.load(sessionIdB);
    if (!a || !b) return null;

    return {
      decisionDelta: b.decisions.length - a.decisions.length,
      observationDelta: b.observations.length - a.observations.length,
      phaseDiff: { a: a.phase, b: b.phase },
    };
  }
}

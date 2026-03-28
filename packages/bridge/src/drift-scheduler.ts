/**
 * Drift Scheduler — Continuous architectural drift monitoring
 *
 * Runs DriftDetector on a configurable interval, compares snapshots
 * over time, and emits events when significant drift is detected.
 *
 * Uses NexusEventBus for event-driven alerting (ReactionEngine
 * can listen and trigger Slack/webhook notifications).
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import { NexusEventType, NexusLayer } from "@nexus/types";
import type { NexusEvent } from "@nexus/types";
import {
  DriftDetector,
  type ADRConstraint,
  type CodebaseInspector,
  type DriftResult,
} from "./drift-detector.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface DriftSchedulerConfig {
  /** Interval in milliseconds between drift checks (default: 24h) */
  intervalMs?: number;
  /** Drift score delta threshold to emit events (default: 10) */
  deltaThreshold?: number;
  /** Minimum drift score to trigger alert (default: 80 — alert below this) */
  minDriftScore?: number;
  /** ADR constraints to evaluate */
  adrs: ADRConstraint[];
  /** Project path for event metadata */
  projectPath?: string;
}

export interface DriftSnapshot {
  timestamp: string;
  driftScore: number;
  violationCount: number;
  result: DriftResult;
}

export interface DriftEvent {
  type: "drift.detected" | "drift.improved" | "drift.check";
  current: DriftSnapshot;
  previous: DriftSnapshot | null;
  delta: number;
}

type EventEmitter = (event: NexusEvent) => void;

// ═══════════════════════════════════════════════════════════════
// DRIFT SCHEDULER
// ═══════════════════════════════════════════════════════════════

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const DEFAULT_CONFIG: Required<Omit<DriftSchedulerConfig, "adrs">> = {
  intervalMs: ONE_DAY_MS,
  deltaThreshold: 10,
  minDriftScore: 80,
  projectPath: ".",
};

export class DriftScheduler {
  private config: Required<Omit<DriftSchedulerConfig, "adrs">>;
  private adrs: ADRConstraint[];
  private detector: DriftDetector;
  private timer: ReturnType<typeof setInterval> | null = null;
  private snapshots: DriftSnapshot[] = [];
  private emitter: EventEmitter | null = null;
  private running = false;

  constructor(
    inspector: CodebaseInspector,
    config: DriftSchedulerConfig,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.adrs = config.adrs;
    this.detector = new DriftDetector(inspector);
  }

  /**
   * Register an event emitter (typically NexusEventBus.emit).
   */
  onEvent(emitter: EventEmitter): void {
    this.emitter = emitter;
  }

  /**
   * Start the scheduled drift checks.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    // Run immediately on start
    this.runCheck();

    // Schedule recurring checks
    this.timer = setInterval(() => {
      this.runCheck();
    }, this.config.intervalMs);
  }

  /**
   * Stop the scheduler.
   */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Run a single drift check (can also be called manually).
   */
  runCheck(): DriftEvent {
    const result = this.detector.detect(this.adrs);
    const current: DriftSnapshot = {
      timestamp: result.timestamp,
      driftScore: result.driftScore,
      violationCount: result.drifts.length,
      result,
    };

    const previous = this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1]
      : null;

    const delta = previous
      ? current.driftScore - previous.driftScore
      : 0;

    // Determine event type
    let eventType: DriftEvent["type"] = "drift.check";
    if (previous) {
      if (delta < -this.config.deltaThreshold) {
        eventType = "drift.detected"; // Score dropped significantly
      } else if (delta > this.config.deltaThreshold) {
        eventType = "drift.improved";
      }
    }

    // Alert if below minimum score
    if (current.driftScore < this.config.minDriftScore) {
      eventType = "drift.detected";
    }

    const event: DriftEvent = {
      type: eventType,
      current,
      previous,
      delta,
    };

    // Store snapshot
    this.snapshots.push(current);

    // Emit event via NexusEventBus
    if (this.emitter) {
      this.emitter({
        id: `drift-${Date.now()}`,
        type: NexusEventType.DRIFT_DETECTED,
        source: NexusLayer.PERCEPTION,
        timestamp: current.timestamp,
        correlationId: `drift-cycle-${this.snapshots.length}`,
        payload: {
          eventType,
          driftScore: current.driftScore,
          violationCount: current.violationCount,
          delta,
          summary: result.summary,
        },
        metadata: {
          projectPath: this.config.projectPath,
        },
      });
    }

    return event;
  }

  /**
   * Get all historical snapshots.
   */
  getSnapshots(): readonly DriftSnapshot[] {
    return this.snapshots;
  }

  /**
   * Get the latest snapshot.
   */
  getLatest(): DriftSnapshot | null {
    return this.snapshots.length > 0
      ? this.snapshots[this.snapshots.length - 1]
      : null;
  }

  /**
   * Check if the scheduler is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Load pre-existing snapshots (e.g., from FileStateStore).
   */
  loadSnapshots(snapshots: DriftSnapshot[]): void {
    this.snapshots = [...snapshots];
  }
}

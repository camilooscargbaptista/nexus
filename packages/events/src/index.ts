/**
 * @camilooscargbaptista/nexus-events — Event bus for cross-layer communication
 *
 * The nervous system of Nexus. Every detection, guidance, and validation
 * flows through this bus, enabling the closed feedback loop:
 *   Perception → Reasoning → Validation → Autonomy → Perception
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import { randomUUID } from "node:crypto";
import type {
  NexusEvent,
  NexusEventType,
  NexusEventMetadata,
  NexusLayer,
} from "@camilooscargbaptista/nexus-types";

// ═══════════════════════════════════════════════════════════════
// EVENT HANDLER TYPES
// ═══════════════════════════════════════════════════════════════

export type EventHandler<T = unknown> = (event: NexusEvent<T>) => void | Promise<void>;
export type EventFilter = (event: NexusEvent) => boolean;

interface Subscription {
  id: string;
  eventType: NexusEventType | "*";
  handler: EventHandler;
  filter?: EventFilter;
  once: boolean;
}

// ═══════════════════════════════════════════════════════════════
// NEXUS EVENT BUS
// ═══════════════════════════════════════════════════════════════

export class NexusEventBus {
  private subscriptions: Map<string, Subscription> = new Map();
  private eventLog: NexusEvent[] = [];
  private maxLogSize: number;

  constructor(options: { maxLogSize?: number } = {}) {
    this.maxLogSize = options.maxLogSize ?? 10_000;
  }

  /**
   * Subscribe to events of a specific type.
   * Use "*" to subscribe to all events.
   */
  on<T = unknown>(
    eventType: NexusEventType | "*",
    handler: EventHandler<T>,
    options: { filter?: EventFilter; once?: boolean } = {}
  ): string {
    const id = randomUUID();
    this.subscriptions.set(id, {
      id,
      eventType,
      handler: handler as EventHandler,
      filter: options.filter,
      once: options.once ?? false,
    });
    return id;
  }

  /**
   * Subscribe to a single occurrence of an event type.
   */
  once<T = unknown>(eventType: NexusEventType, handler: EventHandler<T>): string {
    return this.on(eventType, handler, { once: true });
  }

  /**
   * Unsubscribe by subscription ID.
   */
  off(subscriptionId: string): boolean {
    return this.subscriptions.delete(subscriptionId);
  }

  /**
   * Emit an event to all matching subscribers.
   */
  async emit<T = unknown>(event: NexusEvent<T>): Promise<void> {
    // Log the event
    this.eventLog.push(event as NexusEvent);
    if (this.eventLog.length > this.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.maxLogSize);
    }

    // Find and execute matching handlers
    const toRemove: string[] = [];

    for (const [id, sub] of this.subscriptions) {
      const typeMatch = sub.eventType === "*" || sub.eventType === event.type;
      const filterMatch = !sub.filter || sub.filter(event as NexusEvent);

      if (typeMatch && filterMatch) {
        try {
          await sub.handler(event as NexusEvent);
        } catch (error) {
          console.error(
            `[NexusEventBus] Handler error for ${event.type}:`,
            error
          );
        }
        if (sub.once) {
          toRemove.push(id);
        }
      }
    }

    for (const id of toRemove) {
      this.subscriptions.delete(id);
    }
  }

  /**
   * Create and emit an event in one call.
   */
  async publish<T = unknown>(
    type: NexusEventType,
    source: NexusLayer,
    payload: T,
    metadata: NexusEventMetadata,
    correlationId?: string
  ): Promise<NexusEvent<T>> {
    const event: NexusEvent<T> = {
      id: randomUUID(),
      type,
      source,
      timestamp: new Date().toISOString(),
      correlationId: correlationId ?? randomUUID(),
      payload,
      metadata,
    };
    await this.emit(event);
    return event;
  }

  /**
   * Get events from the log, optionally filtered.
   */
  getLog(options: {
    type?: NexusEventType;
    source?: NexusLayer;
    correlationId?: string;
    since?: string;
    limit?: number;
  } = {}): NexusEvent[] {
    let events = [...this.eventLog];

    if (options.type) events = events.filter((e) => e.type === options.type);
    if (options.source) events = events.filter((e) => e.source === options.source);
    if (options.correlationId)
      events = events.filter((e) => e.correlationId === options.correlationId);
    if (options.since)
      events = events.filter((e) => e.timestamp >= options.since!);
    if (options.limit) events = events.slice(-options.limit);

    return events;
  }

  /**
   * Get all events for a specific pipeline run.
   */
  getPipelineEvents(correlationId: string): NexusEvent[] {
    return this.getLog({ correlationId });
  }

  /**
   * Clear the event log.
   */
  clearLog(): void {
    this.eventLog = [];
  }

  /**
   * Get subscription count.
   */
  get subscriberCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get log size.
   */
  get logSize(): number {
    return this.eventLog.length;
  }

  /**
   * Remove all subscriptions.
   */
  reset(): void {
    this.subscriptions.clear();
    this.eventLog = [];
  }
}

// Singleton for shared use across the platform
export const nexusEvents = new NexusEventBus();

// Sprint 2 — Middleware Logging
export { withLogging, withTiming, MiddlewareChain } from "./middleware.js";
export type { MiddlewareContext, ToolHandler, Middleware } from "./middleware.js";


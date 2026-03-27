/**
 * Action Executors — Real implementations for the ReactionEngine
 *
 * Provides concrete executors that perform actual actions when
 * the ReactionEngine triggers reactions to pipeline events.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import type { ActionExecutor, SystemEvent, ReactionAction } from "./reaction-engine.js";

// ═══════════════════════════════════════════════════════════════
// CONSOLE EXECUTOR — Logs actions to console with formatting
// ═══════════════════════════════════════════════════════════════

export class ConsoleExecutor implements ActionExecutor {
  private readonly prefix: string;

  constructor(prefix: string = "[Nexus Reaction]") {
    this.prefix = prefix;
  }

  async execute(action: ReactionAction, event: SystemEvent, _context?: Record<string, unknown>): Promise<string> {
    const timestamp = new Date().toISOString();
    const severity = event.severity.toUpperCase().padEnd(8);
    const message = `${this.prefix} ${timestamp} ${severity} | Action: ${action} | Event: ${event.type} | Source: ${event.source}`;

    switch (event.severity) {
      case "critical":
        console.error(message);
        break;
      case "medium":
        console.warn(message);
        break;
      default:
        console.log(message);
    }

    if (event.metadata) {
      console.log(`${this.prefix}   Data: ${JSON.stringify(event.metadata).substring(0, 200)}`);
    }

    return `Logged to console: ${action} for ${event.type}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// FILE REPORTER — Writes action reports to filesystem
// ═══════════════════════════════════════════════════════════════

export interface FileReporterConfig {
  /** Directory to write reports. Default: ".nexus/reactions" */
  outputDir: string;
  /** Format: "json" for structured or "text" for human-readable */
  format?: "json" | "text";
  /** Max file size in bytes before rotation. Default: 5MB */
  maxFileSize?: number;
}

interface ReactionLogEntry {
  timestamp: string;
  action: ReactionAction;
  event: {
    type: string;
    source: string;
    severity: string;
    data?: unknown;
  };
  result: string;
}

export class FileReporterExecutor implements ActionExecutor {
  private readonly outputDir: string;
  private readonly format: "json" | "text";
  private readonly maxFileSize: number;
  private logFile: string;

  constructor(config: FileReporterConfig) {
    this.outputDir = resolve(config.outputDir);
    this.format = config.format ?? "json";
    this.maxFileSize = config.maxFileSize ?? 5 * 1024 * 1024; // 5MB

    if (!existsSync(this.outputDir)) {
      mkdirSync(this.outputDir, { recursive: true });
    }

    const ext = this.format === "json" ? "jsonl" : "log";
    this.logFile = join(this.outputDir, `reactions.${ext}`);
  }

  async execute(action: ReactionAction, event: SystemEvent, _context?: Record<string, unknown>): Promise<string> {
    this.rotateIfNeeded();

    const entry: ReactionLogEntry = {
      timestamp: new Date().toISOString(),
      action,
      event: {
        type: event.type,
        source: event.source,
        severity: event.severity,
        data: event.metadata,
      },
      result: `Executed ${action} for ${event.type}`,
    };

    if (this.format === "json") {
      appendFileSync(this.logFile, JSON.stringify(entry) + "\n", "utf-8");
    } else {
      const line = `[${entry.timestamp}] ${event.severity.toUpperCase().padEnd(8)} ` +
        `ACTION=${action} EVENT=${event.type} SOURCE=${event.source}\n`;
      appendFileSync(this.logFile, line, "utf-8");
    }

    return `Written to ${this.logFile}: ${action} for ${event.type}`;
  }

  /** Get the current log file path */
  getLogFile(): string {
    return this.logFile;
  }

  private rotateIfNeeded(): void {
    if (!existsSync(this.logFile)) return;

    try {
      const { size } = require("node:fs").statSync(this.logFile);
      if (size >= this.maxFileSize) {
        const rotated = `${this.logFile}.${Date.now()}`;
        require("node:fs").renameSync(this.logFile, rotated);
      }
    } catch {
      // Ignore rotation errors
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// WEBHOOK EXECUTOR — Sends events to HTTP endpoints
// ═══════════════════════════════════════════════════════════════

export interface WebhookConfig {
  /** Webhook URL to POST events to */
  url: string;
  /** Optional auth headers */
  headers?: Record<string, string>;
  /** Timeout in ms. Default: 5000 */
  timeout?: number;
  /** Retry count on failure. Default: 1 */
  retries?: number;
}

export class WebhookExecutor implements ActionExecutor {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config: WebhookConfig) {
    this.url = config.url;
    this.headers = {
      "Content-Type": "application/json",
      "User-Agent": "Nexus-ReactionEngine/0.1.0",
      ...config.headers,
    };
    this.timeout = config.timeout ?? 5000;
    this.retries = config.retries ?? 1;
  }

  async execute(action: ReactionAction, event: SystemEvent, _context?: Record<string, unknown>): Promise<string> {
    const payload = {
      action,
      event: {
        type: event.type,
        source: event.source,
        severity: event.severity,
        timestamp: event.timestamp,
        data: event.metadata,
      },
      nexus: {
        version: "0.1.0",
        sentAt: new Date().toISOString(),
      },
    };

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(this.url, {
          method: "POST",
          headers: this.headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          return `Webhook delivered to ${this.url}: ${response.status}`;
        }

        // Retry on 5xx
        if (response.status >= 500 && attempt < this.retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }

        return `Webhook failed: ${this.url} returned ${response.status}`;
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.retries) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    return `Webhook failed after ${this.retries + 1} attempts: ${lastError?.message ?? "unknown"}`;
  }
}

// ═══════════════════════════════════════════════════════════════
// COMPOSITE EXECUTOR — Chains multiple executors
// ═══════════════════════════════════════════════════════════════

export class CompositeExecutor implements ActionExecutor {
  private readonly executors: ActionExecutor[];

  constructor(executors: ActionExecutor[]) {
    this.executors = executors;
  }

  async execute(action: ReactionAction, event: SystemEvent, _context?: Record<string, unknown>): Promise<string> {
    const results: string[] = [];

    for (const executor of this.executors) {
      try {
        const result = await executor.execute(action, event, {});
        results.push(result);
      } catch (err) {
        results.push(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return results.join(" | ");
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTORY — Easy creation of executor chains
// ═══════════════════════════════════════════════════════════════

export interface ExecutorFactoryConfig {
  console?: boolean | { prefix: string };
  file?: FileReporterConfig;
  webhooks?: WebhookConfig[];
}

export function createExecutor(config: ExecutorFactoryConfig): ActionExecutor {
  const executors: ActionExecutor[] = [];

  if (config.console !== false) {
    const prefix = typeof config.console === "object" ? config.console.prefix : undefined;
    executors.push(new ConsoleExecutor(prefix));
  }

  if (config.file) {
    executors.push(new FileReporterExecutor(config.file));
  }

  if (config.webhooks) {
    for (const wh of config.webhooks) {
      executors.push(new WebhookExecutor(wh));
    }
  }

  if (executors.length === 0) {
    executors.push(new ConsoleExecutor());
  }

  if (executors.length === 1) {
    return executors[0]!;
  }

  return new CompositeExecutor(executors);
}

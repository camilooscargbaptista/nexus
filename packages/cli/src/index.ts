#!/usr/bin/env node
/**
 * Nexus CLI — Autonomous Engineering Intelligence
 *
 * Usage:
 *   nexus analyze [path]       Full pipeline analysis
 *   nexus score [path]         Quick architecture score
 *   nexus status               Show last run status
 *   nexus history [project]    Show analysis trend
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

import { resolve } from "node:path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { NexusPipeline } from "@camilooscargbaptista/nexus-bridge";
import { NexusEventBus } from "@camilooscargbaptista/nexus-events";
import type { NexusPipelineResult } from "@camilooscargbaptista/nexus-types";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

const VERSION = "0.1.0";
const NEXUS_DIR = ".nexus";
const HISTORY_FILE = "history.json";

// ═══════════════════════════════════════════════════════════════
// COLOR HELPERS (ANSI escape codes — no dependencies)
// ═══════════════════════════════════════════════════════════════

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  amber: "\x1b[38;5;214m",
};

function color(text: string, ...codes: string[]): string {
  return `${codes.join("")}${text}${c.reset}`;
}

// ═══════════════════════════════════════════════════════════════
// FORMATTERS
// ═══════════════════════════════════════════════════════════════

function scoreColor(score: number): string {
  if (score >= 80) return c.green;
  if (score >= 60) return c.yellow;
  return c.red;
}

function severityIcon(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical": return color("●", c.red, c.bold);
    case "high": return color("●", c.red);
    case "medium": return color("●", c.yellow);
    case "low": return color("●", c.dim);
    default: return color("○", c.dim);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function bar(value: number, max: number = 100, width: number = 20): string {
  const filled = Math.round((value / max) * width);
  const empty = width - filled;
  const sc = scoreColor(value);
  return `${sc}${"█".repeat(filled)}${c.dim}${"░".repeat(empty)}${c.reset}`;
}

// ═══════════════════════════════════════════════════════════════
// BANNER
// ═══════════════════════════════════════════════════════════════

function printBanner(): void {
  console.log();
  console.log(color("  ╔══════════════════════════════════════════╗", c.amber));
  console.log(color("  ║", c.amber) + color("  ⚡ NEXUS", c.amber, c.bold) + color(" — Engineering Intelligence   ", c.dim) + color("║", c.amber));
  console.log(color("  ║", c.amber) + color("  Girardelli Tecnologia", c.dim) + color("                    ║", c.amber));
  console.log(color("  ╚══════════════════════════════════════════╝", c.amber));
  console.log();
}

// ═══════════════════════════════════════════════════════════════
// COMMANDS
// ═══════════════════════════════════════════════════════════════

interface HistoryEntry {
  timestamp: string;
  projectPath: string;
  projectName: string;
  healthScore: number;
  architectScore: number;
  antiPatterns: number;
  skillsActivated: number;
  duration: number;
}

function ensureNexusDir(projectPath: string): string {
  const dir = resolve(projectPath, NEXUS_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function loadHistory(projectPath: string): HistoryEntry[] {
  const file = resolve(projectPath, NEXUS_DIR, HISTORY_FILE);
  if (!existsSync(file)) return [];
  try {
    return JSON.parse(readFileSync(file, "utf-8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(projectPath: string, entries: HistoryEntry[]): void {
  ensureNexusDir(projectPath);
  const file = resolve(projectPath, NEXUS_DIR, HISTORY_FILE);
  writeFileSync(file, JSON.stringify(entries, null, 2), "utf-8");
}

function appendHistory(projectPath: string, result: NexusPipelineResult): void {
  const entries = loadHistory(projectPath);
  entries.push({
    timestamp: result.timestamp,
    projectPath: result.projectPath,
    projectName: result.projectName,
    healthScore: result.healthScore,
    architectScore: result.perception?.score?.overall ?? 0,
    antiPatterns: result.perception?.antiPatterns?.length ?? 0,
    skillsActivated: result.reasoning?.length ?? 0,
    duration: result.duration,
  });
  // Keep last 100 entries
  if (entries.length > 100) entries.splice(0, entries.length - 100);
  saveHistory(projectPath, entries);
}

// ── analyze ──────────────────────────────────────────────────

async function cmdAnalyze(projectPath: string, jsonMode = false): Promise<void> {
  const absPath = resolve(projectPath);

  if (!existsSync(absPath)) {
    if (jsonMode) {
      console.log(JSON.stringify({ score: 0, findings: [], error: `Path not found: ${absPath}` }));
    } else {
      console.error(color(`  Error: Path not found: ${absPath}`, c.red));
    }
    process.exit(1);
  }

  if (!jsonMode) {
    console.log(color("  Target:", c.dim), color(absPath, c.white, c.bold));
    console.log();
  }

  const eventBus = new NexusEventBus();

  // Wire up progress logging (only in interactive mode)
  if (!jsonMode) {
    eventBus.on("*" as any, (event) => {
      const e = event as any;
      if (e.type === "architecture.analyzed") {
        console.log(color("  ⚡ Layer I: Perception", c.amber, c.bold), color("(Architect)", c.dim));
      } else if (e.type === "skill.triggered") {
        console.log(color(`     → Skill: ${e.payload?.skillName}`, c.cyan));
      } else if (e.type === "guidance.generated") {
        console.log(color("  🧠 Layer II: Reasoning", c.blue, c.bold), color("(CTO Toolkit)", c.dim));
      } else if (e.type === "validation.completed") {
        console.log(color("  🛡️  Layer III: Validation", c.green, c.bold), color("(Sentinel)", c.dim));
      }
    });
  }

  const pipeline = new NexusPipeline(
    {
      projectPath: absPath,
      perception: { enabled: true },
      reasoning: { enabled: true },
      validation: { enabled: true, securityLevel: "standard", testingThreshold: 70 },
    } as any,
    { eventBus },
  );

  const start = Date.now();

  try {
    const result = await pipeline.run(absPath);
    const elapsed = Date.now() - start;

    // Save to history
    appendHistory(absPath, result);

    if (jsonMode) {
      // JSON output for CI/action consumption
      const findings = [
        ...(result.perception?.antiPatterns ?? []).map((ap: any) => ({
          severity: ap.severity,
          pattern: ap.pattern,
          location: ap.location,
          description: ap.description,
        })),
      ];
      console.log(JSON.stringify({
        score: result.healthScore ?? result.perception?.score?.overall ?? 0,
        findings,
        duration: elapsed,
        trend: result.trend,
        architectScore: result.perception?.score?.overall ?? 0,
        modularity: result.perception?.score?.modularity ?? 0,
        coupling: result.perception?.score?.coupling ?? 0,
        cohesion: result.perception?.score?.cohesion ?? 0,
        layering: result.perception?.score?.layering ?? 0,
        skillsActivated: result.reasoning?.length ?? 0,
      }));
    } else {
      // Rich formatted output
      printResults(result, elapsed, absPath);
    }
  } catch (err) {
    const elapsed = Date.now() - start;

    if (jsonMode) {
      console.log(JSON.stringify({
        score: 0,
        findings: [],
        error: err instanceof Error ? err.message : String(err),
        duration: elapsed,
      }));
      process.exit(1);
    }

    console.log();
    console.error(color("  ✗ Pipeline failed", c.red, c.bold), color(`(${formatDuration(elapsed)})`, c.dim));
    console.error(color(`    ${err instanceof Error ? err.message : String(err)}`, c.red));
    console.log();
    console.log(color("  Tip:", c.yellow), "Make sure @girardelli/architect is installed:");
    console.log(color("    npm install @girardelli/architect", c.dim));
    console.log();
    process.exit(1);
  }
}

function printResults(result: NexusPipelineResult, elapsed: number, projectPath: string): void {
  console.log();
  console.log(color("  ═══════════════════════════════════════════", c.amber));
  console.log(color("  Results", c.amber, c.bold), color(`(${formatDuration(elapsed)})`, c.dim));
  console.log(color("  ═══════════════════════════════════════════", c.amber));
  console.log();

  // Health Score
  const hs = result.healthScore;
  console.log(`  ${color("Health Score:", c.bold)} ${color(String(hs), scoreColor(hs), c.bold)}/100  ${bar(hs)}`);
  console.log(`  ${color("Trend:", c.bold)}        ${result.trend}`);
  console.log();

  // Architecture Breakdown
  if (result.perception) {
    const p = result.perception;
    console.log(color("  Architecture", c.amber, c.bold));
    console.log(`    Overall:    ${color(String(p.score.overall), scoreColor(p.score.overall), c.bold)}/100  ${bar(p.score.overall)}`);
    console.log(`    Modularity: ${color(String(p.score.modularity), scoreColor(p.score.modularity))}/100  ${bar(p.score.modularity)}`);
    console.log(`    Coupling:   ${color(String(p.score.coupling), scoreColor(p.score.coupling))}/100  ${bar(p.score.coupling)}`);
    console.log(`    Cohesion:   ${color(String(p.score.cohesion), scoreColor(p.score.cohesion))}/100  ${bar(p.score.cohesion)}`);
    console.log(`    Layering:   ${color(String(p.score.layering), scoreColor(p.score.layering))}/100  ${bar(p.score.layering)}`);
    console.log();

    // Anti-patterns
    if (p.antiPatterns.length > 0) {
      console.log(color("  Anti-Patterns", c.red, c.bold), color(`(${p.antiPatterns.length})`, c.dim));
      for (const ap of p.antiPatterns.slice(0, 10)) {
        console.log(`    ${severityIcon(ap.severity)} ${color(ap.pattern, c.bold)} ${color(`@ ${ap.location}`, c.dim)}`);
        if (ap.description) {
          console.log(`      ${color(ap.description.substring(0, 80), c.dim)}`);
        }
      }
      if (p.antiPatterns.length > 10) {
        console.log(color(`    ... and ${p.antiPatterns.length - 10} more`, c.dim));
      }
      console.log();
    }

    // Layers
    if (p.layers.length > 0) {
      console.log(color("  Layers", c.blue, c.bold));
      for (const layer of p.layers) {
        console.log(`    ${color(layer.name, c.cyan)} (${layer.type}) — ${layer.fileCount} files`);
      }
      console.log();
    }
  }

  // Reasoning (Skills)
  if (result.reasoning && result.reasoning.length > 0) {
    console.log(color("  Skills Activated", c.blue, c.bold), color(`(${result.reasoning.length})`, c.dim));
    for (const skill of result.reasoning) {
      const findingsCount = skill.findings?.length ?? 0;
      const recsCount = skill.recommendations?.length ?? 0;
      console.log(`    ${color(skill.skillName, c.cyan)} [${skill.category}] — ${findingsCount} findings, ${recsCount} recommendations`);
    }
    console.log();
  }

  // Validation
  if (result.validation) {
    const v = result.validation;
    const icon = v.success ? color("✓", c.green, c.bold) : color("✗", c.red, c.bold);
    console.log(color("  Validation", c.green, c.bold), `${icon} Score: ${color(String(v.overallScore), scoreColor(v.overallScore))}/100`);
    if (v.issueCount) {
      console.log(`    Issues: ${color(String(v.issueCount.critical), c.red)} critical, ${color(String(v.issueCount.high), c.yellow)} high, ${v.issueCount.medium} medium, ${v.issueCount.low} low`);
    }
    console.log();
  }

  // Insights
  if (result.insights && result.insights.length > 0) {
    console.log(color("  Cross-layer Insights", c.magenta, c.bold), color(`(${result.insights.length})`, c.dim));
    for (const insight of result.insights.slice(0, 5)) {
      console.log(`    ${severityIcon(insight.severity)} ${insight.title}`);
    }
    console.log();
  }

  // History trend
  const history = loadHistory(projectPath);
  if (history.length > 1) {
    const prev = history[history.length - 2]!;
    const delta = hs - prev.healthScore;
    const arrow = delta > 0 ? color(`↑ +${delta}`, c.green) : delta < 0 ? color(`↓ ${delta}`, c.red) : color("→ 0", c.dim);
    console.log(color("  Trend:", c.bold), `${arrow} ${color("vs last run", c.dim)}`);
    console.log();
  }

  // Report saved
  console.log(color(`  Report saved to ${NEXUS_DIR}/${HISTORY_FILE}`, c.dim));
  console.log();
}

// ── score ────────────────────────────────────────────────────

async function cmdScore(projectPath: string): Promise<void> {
  const absPath = resolve(projectPath);

  if (!existsSync(absPath)) {
    console.error(color(`  Error: Path not found: ${absPath}`, c.red));
    process.exit(1);
  }

  console.log(color("  Quick Score:", c.bold), color(absPath, c.dim));
  console.log();

  // Only run perception layer for quick score
  const pipeline = new NexusPipeline({
    projectPath: absPath,
    perception: { enabled: true },
    reasoning: { enabled: false },
    validation: { enabled: false },
  } as any);

  try {
    const result = await pipeline.run(absPath);
    if (result.perception) {
      const s = result.perception.score;
      console.log(`  Overall:    ${color(String(s.overall), scoreColor(s.overall), c.bold)}/100  ${bar(s.overall)}`);
      console.log(`  Modularity: ${color(String(s.modularity), scoreColor(s.modularity))}/100  ${bar(s.modularity)}`);
      console.log(`  Coupling:   ${color(String(s.coupling), scoreColor(s.coupling))}/100  ${bar(s.coupling)}`);
      console.log(`  Cohesion:   ${color(String(s.cohesion), scoreColor(s.cohesion))}/100  ${bar(s.cohesion)}`);
      console.log(`  Layering:   ${color(String(s.layering), scoreColor(s.layering))}/100  ${bar(s.layering)}`);
    }
    console.log();
  } catch (err) {
    console.error(color(`  Error: ${err instanceof Error ? err.message : String(err)}`, c.red));
    process.exit(1);
  }
}

// ── status ───────────────────────────────────────────────────

function cmdStatus(projectPath: string): void {
  const history = loadHistory(resolve(projectPath));
  if (history.length === 0) {
    console.log(color("  No previous runs found.", c.dim));
    console.log(color("  Run:", c.dim), color("nexus analyze .", c.bold));
    console.log();
    return;
  }

  const last = history[history.length - 1]!;
  console.log(color("  Last Run:", c.bold));
  console.log(`    Project:      ${color(last.projectName, c.cyan)}`);
  console.log(`    Health Score:  ${color(String(last.healthScore), scoreColor(last.healthScore), c.bold)}/100`);
  console.log(`    Arch Score:    ${color(String(last.architectScore), scoreColor(last.architectScore))}/100`);
  console.log(`    Anti-patterns: ${last.antiPatterns}`);
  console.log(`    Skills:        ${last.skillsActivated}`);
  console.log(`    Duration:      ${formatDuration(last.duration)}`);
  console.log(`    Date:          ${new Date(last.timestamp).toLocaleString()}`);
  console.log();
}

// ── history ──────────────────────────────────────────────────

function cmdHistory(projectPath: string): void {
  const history = loadHistory(resolve(projectPath));
  if (history.length === 0) {
    console.log(color("  No history found.", c.dim));
    return;
  }

  console.log(color("  Analysis History", c.amber, c.bold), color(`(${history.length} runs)`, c.dim));
  console.log();
  console.log(color("  Date                 Score  Trend  Anti-patterns  Duration", c.dim));
  console.log(color("  " + "─".repeat(65), c.dim));

  for (let i = 0; i < history.length; i++) {
    const entry = history[i]!;
    const date = new Date(entry.timestamp).toLocaleString().padEnd(20);
    const score = String(entry.healthScore).padStart(3);
    const delta = i > 0 ? entry.healthScore - history[i - 1]!.healthScore : 0;
    const trend = delta > 0 ? color(`+${delta}`.padStart(5), c.green) : delta < 0 ? color(String(delta).padStart(5), c.red) : color("   0 ", c.dim);
    const aps = String(entry.antiPatterns).padStart(5);
    const dur = formatDuration(entry.duration).padStart(8);

    console.log(`  ${date} ${color(score, scoreColor(entry.healthScore))}    ${trend}       ${aps}        ${dur}`);
  }
  console.log();
}

// ── help ─────────────────────────────────────────────────────

function printHelp(): void {
  console.log(color("  Usage:", c.bold));
  console.log(`    nexus ${color("analyze", c.cyan)} [path]      Full pipeline (Architect + Toolkit + Sentinel)`);
  console.log(`    nexus ${color("score", c.cyan)}   [path]      Quick architecture score (Architect only)`);
  console.log(`    nexus ${color("status", c.cyan)}  [path]      Show last run results`);
  console.log(`    nexus ${color("history", c.cyan)} [path]      Show analysis trend over time`);
  console.log(`    nexus ${color("--help", c.cyan)}              Show this help`);
  console.log(`    nexus ${color("--version", c.cyan)}           Show version`);
  console.log();
  console.log(color("  Options:", c.bold));
  console.log(`    ${color("[path]", c.dim)}    Project directory to analyze (default: current directory)`);
  console.log();
  console.log(color("  Examples:", c.bold));
  console.log(`    nexus analyze .`);
  console.log(`    nexus analyze ./my-project`);
  console.log(`    nexus score ~/code/my-app`);
  console.log(`    nexus history .`);
  console.log();
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonMode = args.includes("--json");
  const filteredArgs = args.filter((a) => a !== "--json");
  const command = filteredArgs[0] ?? "--help";
  const targetPath = filteredArgs[1] ?? ".";

  if (command === "--version" || command === "-v") {
    console.log(`nexus v${VERSION}`);
    return;
  }

  if (!jsonMode) printBanner();

  if (command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  switch (command) {
    case "analyze":
      await cmdAnalyze(targetPath, jsonMode);
      break;
    case "score":
      await cmdScore(targetPath);
      break;
    case "status":
      cmdStatus(targetPath);
      break;
    case "history":
      cmdHistory(targetPath);
      break;
    default:
      console.error(color(`  Unknown command: ${command}`, c.red));
      console.log();
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(color(`Fatal: ${err instanceof Error ? err.message : String(err)}`, c.red));
  process.exit(1);
});

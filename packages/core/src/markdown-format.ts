/**
 * @nexus/core — Markdown Formatting
 *
 * Utilitários centralizados de formatação Markdown para CLI e reports.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TABLE
// ═══════════════════════════════════════════════════════════════

/**
 * Gera uma tabela Markdown a partir de headers e rows.
 *
 * @example
 * ```ts
 * formatTable(["Name", "Score"], [["Auth", "85"], ["API", "72"]]);
 * // | Name | Score |
 * // |------|-------|
 * // | Auth | 85    |
 * // | API  | 72    |
 * ```
 */
export function formatTable(
  headers: string[],
  rows: string[][],
): string {
  if (headers.length === 0) return "";

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const cellWidths = rows.map((r) => (r[i] ?? "").length);
    return Math.max(h.length, ...cellWidths);
  });

  const headerLine = "| " + headers.map((h, i) => h.padEnd(widths[i]!)).join(" | ") + " |";
  const separator = "| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |";
  const dataLines = rows.map(
    (row) => "| " + headers.map((_, i) => (row[i] ?? "").padEnd(widths[i]!)).join(" | ") + " |",
  );

  return [headerLine, separator, ...dataLines].join("\n");
}

// ═══════════════════════════════════════════════════════════════
// DURATION
// ═══════════════════════════════════════════════════════════════

/**
 * Formata duração em milissegundos para formato legível.
 *
 * @example
 * ```ts
 * formatDuration(1234)   // "1.2s"
 * formatDuration(150000) // "2m 30s"
 * formatDuration(45)     // "45ms"
 * ```
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;

  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);

  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

// ═══════════════════════════════════════════════════════════════
// SCORE BAR
// ═══════════════════════════════════════════════════════════════

/**
 * Formata um score como progress bar visual.
 *
 * @example
 * ```ts
 * formatScore(62, 100) // "██████░░░░ 62%"
 * formatScore(8, 10)   // "████████░░ 80%"
 * ```
 */
export function formatScore(score: number, max = 100, barLength = 10): string {
  const pct = Math.round((score / max) * 100);
  const filled = Math.round((score / max) * barLength);
  const empty = barLength - filled;

  const bar = "█".repeat(filled) + "░".repeat(empty);
  return `${bar} ${pct}%`;
}

// ═══════════════════════════════════════════════════════════════
// SEVERITY
// ═══════════════════════════════════════════════════════════════

const SEVERITY_BADGES: Record<string, string> = {
  critical: "🔴 CRITICAL",
  high: "🟠 HIGH",
  medium: "🟡 MEDIUM",
  low: "🔵 LOW",
  info: "⚪ INFO",
};

/**
 * Formata severity como badge com emoji.
 */
export function formatSeverity(severity: string): string {
  return SEVERITY_BADGES[severity.toLowerCase()] ?? `⚪ ${severity.toUpperCase()}`;
}

// ═══════════════════════════════════════════════════════════════
// FILE LIST
// ═══════════════════════════════════════════════════════════════

/**
 * Formata lista de arquivos como bullet list Markdown.
 *
 * @example
 * ```ts
 * formatFileList(["src/auth.ts", "src/api.ts"])
 * // - `src/auth.ts`
 * // - `src/api.ts`
 * ```
 */
export function formatFileList(files: string[]): string {
  if (files.length === 0) return "_No files_";
  return files.map((f) => `- \`${f}\``).join("\n");
}

// ═══════════════════════════════════════════════════════════════
// DIFF
// ═══════════════════════════════════════════════════════════════

/**
 * Formata diff entre antes e depois.
 *
 * @example
 * ```ts
 * formatDiff(62, 78) // "62 → 78 (+16)"
 * formatDiff(90, 85) // "90 → 85 (-5)"
 * ```
 */
export function formatDiff(before: number, after: number): string {
  const delta = after - before;
  const sign = delta >= 0 ? "+" : "";
  return `${before} → ${after} (${sign}${delta})`;
}

// ═══════════════════════════════════════════════════════════════
// SECTION
// ═══════════════════════════════════════════════════════════════

/**
 * Cria uma seção Markdown com heading e conteúdo.
 */
export function formatSection(
  title: string,
  content: string,
  level: 1 | 2 | 3 | 4 = 2,
): string {
  const heading = "#".repeat(level);
  return `${heading} ${title}\n\n${content}`;
}

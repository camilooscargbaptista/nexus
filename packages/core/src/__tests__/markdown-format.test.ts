/**
 * @nexus/core — Markdown Format Tests
 */

import { describe, it, expect } from "@jest/globals";
import {
  formatTable,
  formatDuration,
  formatScore,
  formatSeverity,
  formatFileList,
  formatDiff,
  formatSection,
} from "../markdown-format.js";

describe("formatTable", () => {
  it("should generate a Markdown table", () => {
    const result = formatTable(
      ["Name", "Score"],
      [["Auth", "85"], ["API", "72"]],
    );

    expect(result).toContain("| Name");
    expect(result).toContain("| Auth");
    expect(result).toContain("| API");
    expect(result.split("\n").length).toBe(4); // header + separator + 2 rows
  });

  it("should pad columns to max width", () => {
    const result = formatTable(
      ["Short", "Long Column Name"],
      [["A", "B"]],
    );

    expect(result).toContain("Long Column Name");
  });

  it("should handle empty headers", () => {
    expect(formatTable([], [])).toBe("");
  });
});

describe("formatDuration", () => {
  it("should format milliseconds", () => {
    expect(formatDuration(45)).toBe("45ms");
  });

  it("should format seconds", () => {
    expect(formatDuration(1234)).toBe("1.2s");
  });

  it("should format minutes and seconds", () => {
    expect(formatDuration(150_000)).toBe("2m 30s");
  });

  it("should format hours", () => {
    expect(formatDuration(3_600_000)).toBe("1h");
  });

  it("should format hours and minutes", () => {
    expect(formatDuration(5_400_000)).toBe("1h 30m");
  });
});

describe("formatScore", () => {
  it("should create a progress bar", () => {
    const result = formatScore(62, 100);
    expect(result).toContain("62%");
    expect(result).toContain("█");
    expect(result).toContain("░");
  });

  it("should handle 100%", () => {
    const result = formatScore(100, 100);
    expect(result).toContain("100%");
    expect(result).not.toContain("░");
  });

  it("should handle 0%", () => {
    const result = formatScore(0, 100);
    expect(result).toContain("0%");
    expect(result).not.toContain("█");
  });
});

describe("formatSeverity", () => {
  it("should format known severities", () => {
    expect(formatSeverity("critical")).toBe("🔴 CRITICAL");
    expect(formatSeverity("high")).toBe("🟠 HIGH");
    expect(formatSeverity("medium")).toBe("🟡 MEDIUM");
    expect(formatSeverity("low")).toBe("🔵 LOW");
    expect(formatSeverity("info")).toBe("⚪ INFO");
  });

  it("should handle unknown severity", () => {
    expect(formatSeverity("custom")).toBe("⚪ CUSTOM");
  });
});

describe("formatFileList", () => {
  it("should format file list as bullets", () => {
    const result = formatFileList(["src/auth.ts", "src/api.ts"]);
    expect(result).toContain("- `src/auth.ts`");
    expect(result).toContain("- `src/api.ts`");
  });

  it("should handle empty list", () => {
    expect(formatFileList([])).toBe("_No files_");
  });
});

describe("formatDiff", () => {
  it("should format positive diff", () => {
    expect(formatDiff(62, 78)).toBe("62 → 78 (+16)");
  });

  it("should format negative diff", () => {
    expect(formatDiff(90, 85)).toBe("90 → 85 (-5)");
  });

  it("should format zero diff", () => {
    expect(formatDiff(50, 50)).toBe("50 → 50 (+0)");
  });
});

describe("formatSection", () => {
  it("should create a section with heading", () => {
    const result = formatSection("Title", "Content here");
    expect(result).toBe("## Title\n\nContent here");
  });

  it("should support different heading levels", () => {
    expect(formatSection("H1", "text", 1)).toContain("# H1");
    expect(formatSection("H3", "text", 3)).toContain("### H3");
  });
});

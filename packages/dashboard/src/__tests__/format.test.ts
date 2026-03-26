import { describe, it, expect } from "@jest/globals";
import {
  formatScore,
  formatDuration,
  formatDate,
  formatRelativeTime,
  severityColor,
  statusColor,
  gateResultIcon,
  gateResultText,
  gateResultColor,
  formatNumber,
} from "../lib/format";
import { FindingSeverity, RunStatus, GateResult } from "../types";

describe("formatScore", () => {
  it("should format 0 as 0.0%", () => {
    expect(formatScore(0)).toBe("0%");
  });

  it("should format 0.852 as 85.2%", () => {
    expect(formatScore(85.2)).toBe("85.2%");
  });

  it("should format 1 as 100.0%", () => {
    expect(formatScore(100)).toBe("100%");
  });

  it("should format 50.5 as 50.5%", () => {
    expect(formatScore(50.5)).toBe("50.5%");
  });

  it("should return N/A for null", () => {
    expect(formatScore(null as any)).toBe("N/A");
  });

  it("should return N/A for undefined", () => {
    expect(formatScore(undefined as any)).toBe("N/A");
  });

  it("should return N/A for NaN", () => {
    expect(formatScore(NaN)).toBe("N/A");
  });

  it("should handle very small decimals", () => {
    expect(formatScore(0.15)).toBe("0.2%");
  });

  it("should handle negative numbers", () => {
    expect(formatScore(-10)).toBe("-10%");
  });

  it("should round to one decimal place", () => {
    expect(formatScore(33.456)).toBe("33.5%");
  });
});

describe("formatDuration", () => {
  it("should format 500ms as 0.5s", () => {
    expect(formatDuration(500)).toBe("500ms");
  });

  it("should format 1200ms as 1.2s", () => {
    expect(formatDuration(1200)).toBe("1.2s");
  });

  it("should format 65000ms as 1m 5s", () => {
    expect(formatDuration(65000)).toBe("1m 5s");
  });

  it("should format 3700000ms as 1h 1m", () => {
    expect(formatDuration(3700000)).toBe("1h 1m");
  });

  it("should format 60000ms as 1m 0s", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
  });

  it("should format 3600000ms as 1h 0m", () => {
    expect(formatDuration(3600000)).toBe("1h 0m");
  });

  it("should format 250ms as 250ms", () => {
    expect(formatDuration(250)).toBe("250ms");
  });

  it("should format 100ms as 100ms", () => {
    expect(formatDuration(100)).toBe("100ms");
  });

  it("should return N/A for negative duration", () => {
    expect(formatDuration(-1000)).toBe("N/A");
  });

  it("should return N/A for NaN", () => {
    expect(formatDuration(NaN)).toBe("N/A");
  });

  it("should handle 0ms", () => {
    expect(formatDuration(0)).toBe("0ms");
  });

  it("should format large durations correctly", () => {
    expect(formatDuration(7384000)).toBe("2h 3m");
  });

  it("should format 2 hours exactly", () => {
    expect(formatDuration(7200000)).toBe("2h 0m");
  });

  it("should handle seconds only", () => {
    expect(formatDuration(45000)).toBe("45.0s");
  });
});

describe("formatDate", () => {
  it("should format ISO string to date", () => {
    const result = formatDate("2026-03-26T10:30:00Z");
    expect(result).toContain("Mar");
    expect(result).toContain("26");
    expect(result).toContain("2026");
  });

  it("should format Date object to date", () => {
    const date = new Date("2026-03-26");
    const result = formatDate(date);
    expect(result).toContain("Mar");
    expect(result).toContain("2026");
  });

  it("should return Invalid date for invalid string", () => {
    expect(formatDate("invalid")).toBe("Invalid date");
  });

  it("should return Invalid date for invalid Date", () => {
    expect(formatDate(new Date("invalid"))).toBe("Invalid date");
  });

  it("should format different months correctly", () => {
    const jan = formatDate("2026-01-15");
    const dec = formatDate("2026-12-25");
    expect(jan).toContain("Jan");
    expect(dec).toContain("Dec");
  });

  it("should format year correctly", () => {
    const result = formatDate("2025-06-30");
    expect(result).toContain("2025");
  });
});

describe("formatRelativeTime", () => {
  it("should format time just now", () => {
    const now = new Date();
    expect(formatRelativeTime(now)).toBe("just now");
  });

  it("should format 30 seconds ago", () => {
    const past = new Date(Date.now() - 30 * 1000);
    expect(formatRelativeTime(past)).toBe("30 seconds ago");
  });

  it("should format 1 minute ago", () => {
    const past = new Date(Date.now() - 60 * 1000);
    expect(formatRelativeTime(past)).toBe("1 minute ago");
  });

  it("should format 5 minutes ago", () => {
    const past = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("5 minutes ago");
  });

  it("should format 1 hour ago", () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("1 hour ago");
  });

  it("should format 3 hours ago", () => {
    const past = new Date(Date.now() - 3 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("3 hours ago");
  });

  it("should format 1 day ago", () => {
    const past = new Date(Date.now() - 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("1 day ago");
  });

  it("should format 5 days ago", () => {
    const past = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("5 days ago");
  });

  it("should format 1 week ago", () => {
    const past = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("1 week ago");
  });

  it("should format 2 weeks ago", () => {
    const past = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("2 weeks ago");
  });

  it("should format 1 month ago", () => {
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("1 month ago");
  });

  it("should format 6 months ago", () => {
    const past = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("6 months ago");
  });

  it("should format 1 year ago", () => {
    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("1 year ago");
  });

  it("should format 2 years ago", () => {
    const past = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(past)).toBe("2 years ago");
  });

  it("should return Invalid date for invalid string", () => {
    expect(formatRelativeTime("invalid")).toBe("Invalid date");
  });

  it("should accept ISO string", () => {
    const past = new Date(Date.now() - 2 * 60 * 1000);
    expect(formatRelativeTime(past.toISOString())).toBe("2 minutes ago");
  });
});

describe("severityColor", () => {
  it("should return correct color for critical severity", () => {
    const color = severityColor("critical");
    expect(color).toContain("red");
  });

  it("should return correct color for high severity", () => {
    const color = severityColor("high");
    expect(color).toContain("orange");
  });

  it("should return correct color for medium severity", () => {
    const color = severityColor("medium");
    expect(color).toContain("amber");
  });

  it("should return correct color for low severity", () => {
    const color = severityColor("low");
    expect(color).toContain("blue");
  });

  it("should return correct color for info severity", () => {
    const color = severityColor("info");
    expect(color).toContain("gray");
  });

  it("should return color string for each severity", () => {
    const severities: FindingSeverity[] = ["critical", "high", "medium", "low", "info"];
    severities.forEach((severity) => {
      const color = severityColor(severity);
      expect(typeof color).toBe("string");
      expect(color.length).toBeGreaterThan(0);
    });
  });

  it("should return valid tailwind class format", () => {
    const color = severityColor("critical");
    expect(color).toMatch(/text-\w+-\d+/);
  });
});

describe("statusColor", () => {
  it("should return correct color for PENDING status", () => {
    const color = statusColor("PENDING");
    expect(color).toContain("gray");
  });

  it("should return correct color for RUNNING status", () => {
    const color = statusColor("RUNNING");
    expect(color).toContain("blue");
  });

  it("should return correct color for COMPLETED status", () => {
    const color = statusColor("COMPLETED");
    expect(color).toContain("green");
  });

  it("should return correct color for FAILED status", () => {
    const color = statusColor("FAILED");
    expect(color).toContain("red");
  });

  it("should return correct color for CANCELLED status", () => {
    const color = statusColor("CANCELLED");
    expect(color).toContain("gray");
  });

  it("should return color string for each status", () => {
    const statuses: RunStatus[] = ["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"];
    statuses.forEach((status) => {
      const color = statusColor(status);
      expect(typeof color).toBe("string");
      expect(color.length).toBeGreaterThan(0);
    });
  });

  it("should include dark mode styles", () => {
    const color = statusColor("COMPLETED");
    expect(color).toContain("dark:");
  });
});

describe("gateResultIcon", () => {
  it("should return check for PASSED", () => {
    expect(gateResultIcon("PASSED")).toBe("check");
  });

  it("should return x for FAILED", () => {
    expect(gateResultIcon("FAILED")).toBe("x");
  });

  it("should return alert-triangle for WARNING", () => {
    expect(gateResultIcon("WARNING")).toBe("alert-triangle");
  });

  it("should return valid icon for each gate result", () => {
    const results: GateResult[] = ["PASSED", "FAILED", "WARNING"];
    const validIcons = ["check", "x", "alert-triangle"];
    results.forEach((result) => {
      expect(validIcons).toContain(gateResultIcon(result));
    });
  });
});

describe("gateResultText", () => {
  it("should return Passed for PASSED", () => {
    expect(gateResultText("PASSED")).toBe("Passed");
  });

  it("should return Failed for FAILED", () => {
    expect(gateResultText("FAILED")).toBe("Failed");
  });

  it("should return Warning for WARNING", () => {
    expect(gateResultText("WARNING")).toBe("Warning");
  });
});

describe("gateResultColor", () => {
  it("should return green for PASSED", () => {
    const color = gateResultColor("PASSED");
    expect(color).toContain("green");
  });

  it("should return red for FAILED", () => {
    const color = gateResultColor("FAILED");
    expect(color).toContain("red");
  });

  it("should return amber for WARNING", () => {
    const color = gateResultColor("WARNING");
    expect(color).toContain("amber");
  });
});

describe("formatNumber", () => {
  it("should format 1000 as 1.0K", () => {
    expect(formatNumber(1000)).toBe("1.0K");
  });

  it("should format 1500 as 1.5K", () => {
    expect(formatNumber(1500)).toBe("1.5K");
  });

  it("should format 1500000 as 1.5M", () => {
    expect(formatNumber(1500000)).toBe("1.5M");
  });

  it("should format 1000000 as 1.0M", () => {
    expect(formatNumber(1000000)).toBe("1.0M");
  });

  it("should return 0 for NaN", () => {
    expect(formatNumber(NaN)).toBe("0");
  });

  it("should return string representation for small numbers", () => {
    expect(formatNumber(500)).toBe("500");
  });

  it("should return string representation for numbers less than 1000", () => {
    expect(formatNumber(999)).toBe("999");
  });

  it("should format 5300000 as 5.3M", () => {
    expect(formatNumber(5300000)).toBe("5.3M");
  });

  it("should format 999000 as 999.0K", () => {
    expect(formatNumber(999000)).toBe("999.0K");
  });

  it("should format 0 as 0", () => {
    expect(formatNumber(0)).toBe("0");
  });
});

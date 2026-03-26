import { FindingSeverity, RunStatus, GateResult } from "../types";

/**
 * Format a numeric score as a percentage
 * @param score Number between 0-100
 * @returns Formatted string like "85.2%"
 */
export function formatScore(score: number): string {
  if (typeof score !== "number" || isNaN(score)) {
    return "N/A";
  }
  return `${Math.round(score * 10) / 10}%`;
}

/**
 * Format milliseconds as human-readable duration
 * @param ms Duration in milliseconds
 * @returns Formatted string like "1.2s", "2m 30s", "1h 15m"
 */
export function formatDuration(ms: number): string {
  if (typeof ms !== "number" || isNaN(ms) || ms < 0) {
    return "N/A";
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }

  if (seconds > 0) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return `${ms}ms`;
}

/**
 * Format a date string or Date object
 * @param date Date to format
 * @returns Formatted string like "Mar 26, 2026"
 */
export function formatDate(date: string | Date): string {
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
      return "Invalid date";
    }

    return dateObj.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "Invalid date";
  }
}

/**
 * Format a date as relative time
 * @param date Date to format
 * @returns Formatted string like "2 hours ago", "3 days ago"
 */
export function formatRelativeTime(date: string | Date): string {
  try {
    const dateObj = typeof date === "string" ? new Date(date) : date;

    if (isNaN(dateObj.getTime())) {
      return "Invalid date";
    }

    const now = new Date();
    const diffMs = now.getTime() - dateObj.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    const diffWeeks = Math.floor(diffDays / 7);
    const diffMonths = Math.floor(diffDays / 30);
    const diffYears = Math.floor(diffDays / 365);

    if (diffSeconds < 60) {
      return diffSeconds === 0 ? "just now" : `${diffSeconds} ${diffSeconds === 1 ? "second" : "seconds"} ago`;
    }

    if (diffMinutes < 60) {
      return `${diffMinutes} ${diffMinutes === 1 ? "minute" : "minutes"} ago`;
    }

    if (diffHours < 24) {
      return `${diffHours} ${diffHours === 1 ? "hour" : "hours"} ago`;
    }

    if (diffDays < 7) {
      return `${diffDays} ${diffDays === 1 ? "day" : "days"} ago`;
    }

    if (diffWeeks < 4) {
      return `${diffWeeks} ${diffWeeks === 1 ? "week" : "weeks"} ago`;
    }

    if (diffMonths < 12) {
      return `${diffMonths} ${diffMonths === 1 ? "month" : "months"} ago`;
    }

    return `${diffYears} ${diffYears === 1 ? "year" : "years"} ago`;
  } catch {
    return "Invalid date";
  }
}

/**
 * Get Tailwind color class for a finding severity level
 * @param severity Severity level
 * @returns Tailwind color class
 */
export function severityColor(severity: FindingSeverity): string {
  const colors: Record<FindingSeverity, string> = {
    critical: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
    high: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800",
    medium: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800",
    low: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
    info: "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800",
  };

  return colors[severity] || colors.info;
}

/**
 * Get Tailwind color class for a run status
 * @param status Run status
 * @returns Tailwind color class
 */
export function statusColor(status: RunStatus): string {
  const colors: Record<RunStatus, string> = {
    PENDING: "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800",
    RUNNING: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800",
    COMPLETED: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800",
    FAILED: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800",
    CANCELLED: "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950 border-gray-200 dark:border-gray-800",
  };

  return colors[status] || colors.PENDING;
}

/**
 * Get icon name for a quality gate result
 * @param result Gate result
 * @returns Icon name: "check", "x", or "alert-triangle"
 */
export function gateResultIcon(result: GateResult): "check" | "x" | "alert-triangle" {
  const icons: Record<GateResult, "check" | "x" | "alert-triangle"> = {
    PASSED: "check",
    FAILED: "x",
    WARNING: "alert-triangle",
  };

  return icons[result] || "alert-triangle";
}

/**
 * Get display text for a quality gate result
 * @param result Gate result
 * @returns Display text
 */
export function gateResultText(result: GateResult): string {
  const texts: Record<GateResult, string> = {
    PASSED: "Passed",
    FAILED: "Failed",
    WARNING: "Warning",
  };

  return texts[result] || "Unknown";
}

/**
 * Get Tailwind color class for a quality gate result
 * @param result Gate result
 * @returns Tailwind color class
 */
export function gateResultColor(result: GateResult): string {
  const colors: Record<GateResult, string> = {
    PASSED: "text-green-600 dark:text-green-400",
    FAILED: "text-red-600 dark:text-red-400",
    WARNING: "text-amber-600 dark:text-amber-400",
  };

  return colors[result] || "text-gray-600 dark:text-gray-400";
}

/**
 * Format a large number with abbreviated suffix
 * @param num Number to format
 * @returns Formatted string like "1.2K", "5.3M"
 */
export function formatNumber(num: number): string {
  if (typeof num !== "number" || isNaN(num)) {
    return "0";
  }

  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }

  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }

  return String(num);
}

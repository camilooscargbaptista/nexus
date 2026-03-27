/**
 * @nexus/core — Reward Tracker + Feedback Collector + Reward Report Tests
 */

import { describe, it, expect } from "@jest/globals";
import { RewardTracker } from "../reward-tracker.js";
import { FeedbackCollector } from "../feedback-collector.js";
import { RewardReportGenerator } from "../reward-report.js";

// ═══════════════════════════════════════════════════════════════
// REWARD TRACKER
// ═══════════════════════════════════════════════════════════════

describe("RewardTracker", () => {
  it("should record positive rewards", () => {
    const tracker = new RewardTracker();
    const entry = tracker.record({ actionId: "a1", actionType: "refactor", reward: 0.8 });

    expect(entry.signal).toBe("positive");
    expect(entry.id).toContain("rw-");
    expect(tracker.count).toBe(1);
  });

  it("should record negative rewards", () => {
    const tracker = new RewardTracker();
    const entry = tracker.record({ actionId: "a1", actionType: "security", reward: -0.5 });

    expect(entry.signal).toBe("negative");
  });

  it("should classify neutral rewards", () => {
    const tracker = new RewardTracker();
    const entry = tracker.record({ actionId: "a1", actionType: "docs", reward: 0.05 });

    expect(entry.signal).toBe("neutral");
  });

  it("should provide thumbsUp shortcut", () => {
    const tracker = new RewardTracker();
    const entry = tracker.thumbsUp("a1", "refactor", "Great suggestion");

    expect(entry.reward).toBe(1.0);
    expect(entry.signal).toBe("positive");
  });

  it("should provide thumbsDown shortcut", () => {
    const tracker = new RewardTracker();
    const entry = tracker.thumbsDown("a1", "security", "False positive");

    expect(entry.reward).toBe(-1.0);
    expect(entry.signal).toBe("negative");
  });

  it("should summarize rewards", () => {
    const tracker = new RewardTracker();
    tracker.thumbsUp("a1", "refactor");
    tracker.thumbsUp("a2", "refactor");
    tracker.thumbsDown("a3", "security");

    const summary = tracker.summarize();

    expect(summary.totalRewards).toBe(3);
    expect(summary.positiveCount).toBe(2);
    expect(summary.negativeCount).toBe(1);
    expect(summary.successRate).toBe(67);
  });

  it("should summarize empty tracker", () => {
    const tracker = new RewardTracker();
    const summary = tracker.summarize();

    expect(summary.totalRewards).toBe(0);
    expect(summary.averageReward).toBe(0);
    expect(summary.recentTrend).toBe("stable");
  });

  it("should track by action type", () => {
    const tracker = new RewardTracker();
    tracker.thumbsUp("a1", "refactor");
    tracker.thumbsDown("a2", "refactor");
    tracker.thumbsUp("a3", "security");

    const refactorReward = tracker.getActionTypeReward("refactor");
    expect(refactorReward).toBe(0); // (1 + -1) / 2

    const securityReward = tracker.getActionTypeReward("security");
    expect(securityReward).toBe(1);
  });

  it("should get top actions", () => {
    const tracker = new RewardTracker();
    tracker.thumbsUp("a1", "security");
    tracker.thumbsUp("a2", "refactor");
    tracker.thumbsDown("a3", "docs");

    const top = tracker.getTopActions(2);
    expect(top.best[0]).toBe("security");
    expect(top.worst[0]).toBe("docs");
  });

  it("should detect improving trend", () => {
    const tracker = new RewardTracker({ trendWindow: 6 });

    // First half: bad
    tracker.record({ actionId: "a1", actionType: "t", reward: -0.8 });
    tracker.record({ actionId: "a2", actionType: "t", reward: -0.7 });
    tracker.record({ actionId: "a3", actionType: "t", reward: -0.6 });

    // Second half: good
    tracker.record({ actionId: "a4", actionType: "t", reward: 0.7 });
    tracker.record({ actionId: "a5", actionType: "t", reward: 0.8 });
    tracker.record({ actionId: "a6", actionType: "t", reward: 0.9 });

    const summary = tracker.summarize();
    expect(summary.recentTrend).toBe("improving");
  });
});

// ═══════════════════════════════════════════════════════════════
// FEEDBACK COLLECTOR
// ═══════════════════════════════════════════════════════════════

describe("FeedbackCollector", () => {
  it("should collect and auto-record feedback", () => {
    const tracker = new RewardTracker();
    const collector = new FeedbackCollector(tracker);

    collector.collect({
      source: "user",
      actionId: "a1",
      actionType: "refactor",
      outcome: "accepted",
    });

    expect(tracker.count).toBe(1);
    expect(collector.eventCount).toBe(1);
  });

  it("should use accepted/rejected shortcuts", () => {
    const tracker = new RewardTracker();
    const collector = new FeedbackCollector(tracker);

    collector.accepted("a1", "refactor");
    collector.rejected("a2", "security");

    expect(tracker.count).toBe(2);
    const summary = tracker.summarize();
    expect(summary.positiveCount).toBe(1);
    expect(summary.negativeCount).toBe(1);
  });

  it("should use constitution feedback", () => {
    const tracker = new RewardTracker();
    const collector = new FeedbackCollector(tracker);

    collector.fromConstitution("a1", "quality", 85);
    collector.fromConstitution("a2", "quality", 30);

    expect(tracker.count).toBe(2);
  });

  it("should apply source weights", () => {
    const tracker = new RewardTracker();
    const collector = new FeedbackCollector(tracker, {
      sourceWeights: { user: 1.0, system: 0.5, auto: 0.3, constitution: 0.9 },
    });

    collector.collect({
      source: "auto",
      actionId: "a1",
      actionType: "perf",
      outcome: "accepted",
    });

    // auto weight is 0.3, so reward = 1.0 * 0.3 = 0.3
    const entries = tracker.all;
    expect(entries[0]!.reward).toBeCloseTo(0.3, 1);
  });

  it("should not auto-record when disabled", () => {
    const tracker = new RewardTracker();
    const collector = new FeedbackCollector(tracker, { autoRecord: false });

    const result = collector.collect({
      source: "user",
      actionId: "a1",
      actionType: "refactor",
      outcome: "accepted",
    });

    expect(result).toBeNull();
    expect(tracker.count).toBe(0);
    expect(collector.eventCount).toBe(1);
  });

  it("should collect batch", () => {
    const tracker = new RewardTracker();
    const collector = new FeedbackCollector(tracker);

    collector.collectBatch([
      { source: "user", actionId: "a1", actionType: "r", outcome: "accepted" },
      { source: "user", actionId: "a2", actionType: "r", outcome: "rejected" },
    ]);

    expect(tracker.count).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// REWARD REPORT
// ═══════════════════════════════════════════════════════════════

describe("RewardReportGenerator", () => {
  it("should generate complete report", () => {
    const tracker = new RewardTracker();
    tracker.thumbsUp("a1", "refactor");
    tracker.thumbsUp("a2", "security");
    tracker.thumbsDown("a3", "docs");

    const summary = tracker.summarize();
    const report = RewardReportGenerator.generate(summary);

    expect(report).toContain("Reward Tracker Report");
    expect(report).toContain("Success Rate");
    expect(report).toContain("👍 Positive");
    expect(report).toContain("refactor");
  });

  it("should generate report with custom title", () => {
    const tracker = new RewardTracker();
    tracker.thumbsUp("a1", "test");

    const report = RewardReportGenerator.generate(tracker.summarize(), {
      title: "Weekly Rewards",
    });

    expect(report).toContain("Weekly Rewards");
  });

  it("should include recommendations for low success rate", () => {
    const tracker = new RewardTracker();
    tracker.thumbsDown("a1", "bad");
    tracker.thumbsDown("a2", "bad");
    tracker.thumbsUp("a3", "good");

    const report = RewardReportGenerator.generate(tracker.summarize());
    expect(report).toContain("Recommendations");
  });

  it("should generate empty report gracefully", () => {
    const tracker = new RewardTracker();
    const report = RewardReportGenerator.generate(tracker.summarize());
    expect(report).toContain("Total Rewards");
  });
});

import { jest } from "@jest/globals";
import {
  SessionStateMachine,
  InMemoryStateStore,
  type SessionSnapshot,
  type SessionPhase,
} from "../session-state";

describe("SessionStateMachine", () => {
  let store: InMemoryStateStore;
  let machine: SessionStateMachine;
  const testProjectId = "test-project-123";

  beforeEach(() => {
    store = new InMemoryStateStore();
    machine = new SessionStateMachine(store, testProjectId);
  });

  describe("Constructor", () => {
    it("should initialize with idle phase", () => {
      expect(machine.phase).toBe("idle");
    });

    it("should auto-generate session ID if not provided", () => {
      const sessionId = machine.sessionId;
      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^session-\d+-\d+$/);
    });

    it("should use provided session ID if given", () => {
      const customId = "custom-session-456";
      const customMachine = new SessionStateMachine(store, testProjectId, customId);
      expect(customMachine.sessionId).toBe(customId);
    });

    it("should initialize with empty decisions and observations", () => {
      const snapshot = machine.getSnapshot();
      expect(snapshot.decisions).toEqual([]);
      expect(snapshot.observations).toEqual([]);
    });

    it("should initialize with empty metadata", () => {
      const snapshot = machine.getSnapshot();
      expect(snapshot.metadata).toEqual({});
    });

    it("should initialize with empty phase history", () => {
      const snapshot = machine.getSnapshot();
      expect(snapshot.phaseHistory).toEqual([]);
    });

    it("should set projectId correctly", () => {
      const snapshot = machine.getSnapshot();
      expect(snapshot.projectId).toBe(testProjectId);
    });

    it("should set startedAt and updatedAt dates", () => {
      const snapshot = machine.getSnapshot();
      expect(snapshot.startedAt).toBeInstanceOf(Date);
      expect(snapshot.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe("transition()", () => {
    it("should transition from idle to discover", () => {
      machine.transition("discover", "Started discovery phase");
      expect(machine.phase).toBe("discover");
    });

    it("should transition from discover to define", () => {
      machine.transition("discover", "Start discovery");
      machine.transition("define", "Move to definition");
      expect(machine.phase).toBe("define");
    });

    it("should transition from define to develop", () => {
      machine.transition("discover", "Start");
      machine.transition("define", "Define scope");
      machine.transition("develop", "Start development");
      expect(machine.phase).toBe("develop");
    });

    it("should transition from develop to deliver", () => {
      machine.transition("discover", "Start");
      machine.transition("define", "Define");
      machine.transition("develop", "Develop");
      machine.transition("deliver", "Ready to deliver");
      expect(machine.phase).toBe("deliver");
    });

    it("should transition from deliver to complete", () => {
      machine.transition("discover", "Start");
      machine.transition("define", "Define");
      machine.transition("develop", "Develop");
      machine.transition("deliver", "Deliver");
      machine.transition("complete", "All done");
      expect(machine.phase).toBe("complete");
    });

    it("should transition from complete back to idle", () => {
      machine.transition("discover", "Start");
      machine.transition("define", "Define");
      machine.transition("develop", "Develop");
      machine.transition("deliver", "Deliver");
      machine.transition("complete", "Complete");
      machine.transition("idle", "Reset for new cycle");
      expect(machine.phase).toBe("idle");
    });

    it("should throw Error on invalid transition", () => {
      expect(() => machine.transition("deliver", "Invalid")).toThrow(Error);
    });

    it("should provide descriptive error message for invalid transition", () => {
      expect(() => machine.transition("deliver", "Invalid")).toThrow(
        /Invalid transition: idle → deliver/
      );
    });

    it("should include allowed transitions in error message", () => {
      expect(() => machine.transition("deliver", "Invalid")).toThrow(
        /Allowed: discover, define, develop, review/
      );
    });

    it("should record phase history on valid transition", () => {
      machine.transition("discover", "Start discovery");
      const snapshot = machine.getSnapshot();
      expect(snapshot.phaseHistory).toHaveLength(1);
      expect(snapshot.phaseHistory[0].from).toBe("idle");
      expect(snapshot.phaseHistory[0].to).toBe("discover");
    });

    it("should record reason in phase history", () => {
      const reason = "User initiated discovery";
      machine.transition("discover", reason);
      const snapshot = machine.getSnapshot();
      expect(snapshot.phaseHistory[0].reason).toBe(reason);
    });

    it("should record timestamp in phase history", () => {
      const before = new Date();
      machine.transition("discover", "Test");
      const after = new Date();
      const snapshot = machine.getSnapshot();
      const transitionTime = snapshot.phaseHistory[0].timestamp;
      expect(transitionTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(transitionTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should accumulate phase history across multiple transitions", () => {
      machine.transition("discover", "Reason 1");
      machine.transition("define", "Reason 2");
      machine.transition("develop", "Reason 3");
      const snapshot = machine.getSnapshot();
      expect(snapshot.phaseHistory).toHaveLength(3);
    });

    it("should update updatedAt on transition", () => {
      const before = new Date();
      machine.transition("discover", "Test");
      const after = new Date();
      const snapshot = machine.getSnapshot();
      expect(snapshot.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(snapshot.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("recordDecision()", () => {
    it("should record decision in current phase", () => {
      machine.transition("discover", "Start discovery");
      machine.recordDecision("Decision 1", "Description 1");
      const snapshot = machine.getSnapshot();
      expect(snapshot.decisions).toHaveLength(1);
      expect(snapshot.decisions[0].phase).toBe("discover");
    });

    it("should auto-increment decision ID", () => {
      machine.recordDecision("Decision 1", "Desc 1");
      machine.recordDecision("Decision 2", "Desc 2");
      machine.recordDecision("Decision 3", "Desc 3");
      const snapshot = machine.getSnapshot();
      expect(snapshot.decisions[0].id).toBe("decision-1");
      expect(snapshot.decisions[1].id).toBe("decision-2");
      expect(snapshot.decisions[2].id).toBe("decision-3");
    });

    it("should store title and description", () => {
      const title = "Critical decision";
      const description = "This is important";
      machine.recordDecision(title, description);
      const snapshot = machine.getSnapshot();
      expect(snapshot.decisions[0].title).toBe(title);
      expect(snapshot.decisions[0].description).toBe(description);
    });

    it("should use default importance of 5 if not provided", () => {
      machine.recordDecision("Decision", "Desc");
      const snapshot = machine.getSnapshot();
      expect(snapshot.decisions[0].importance).toBe(5);
    });

    it("should clamp importance to minimum 1", () => {
      machine.recordDecision("Decision", "Desc", -10);
      const snapshot = machine.getSnapshot();
      expect(snapshot.decisions[0].importance).toBe(1);
    });

    it("should clamp importance to maximum 10", () => {
      machine.recordDecision("Decision", "Desc", 50);
      const snapshot = machine.getSnapshot();
      expect(snapshot.decisions[0].importance).toBe(10);
    });

    it("should record timestamp", () => {
      const before = new Date();
      machine.recordDecision("Decision", "Desc");
      const after = new Date();
      const snapshot = machine.getSnapshot();
      const timestamp = snapshot.decisions[0].timestamp;
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should update updatedAt", () => {
      const before = new Date();
      machine.recordDecision("Decision", "Desc");
      const after = new Date();
      const snapshot = machine.getSnapshot();
      expect(snapshot.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(snapshot.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("recordObservation()", () => {
    it("should record observation in current phase", () => {
      machine.transition("discover", "Start");
      machine.recordObservation("finding", "Found something", ["important"]);
      const snapshot = machine.getSnapshot();
      expect(snapshot.observations).toHaveLength(1);
      expect(snapshot.observations[0].phase).toBe("discover");
    });

    it("should store type, content, and keywords", () => {
      const type = "insight";
      const content = "This is an insight";
      const keywords = ["keyword1", "keyword2"];
      machine.recordObservation(type, content, keywords);
      const snapshot = machine.getSnapshot();
      expect(snapshot.observations[0].type).toBe(type);
      expect(snapshot.observations[0].content).toBe(content);
      expect(snapshot.observations[0].keywords).toEqual(keywords);
    });

    it("should auto-increment observation ID", () => {
      machine.recordObservation("finding", "Obs 1", []);
      machine.recordObservation("insight", "Obs 2", []);
      machine.recordObservation("warning", "Obs 3", []);
      const snapshot = machine.getSnapshot();
      expect(snapshot.observations[0].id).toBe("obs-1");
      expect(snapshot.observations[1].id).toBe("obs-2");
      expect(snapshot.observations[2].id).toBe("obs-3");
    });

    it("should use default importance of 5 if not provided", () => {
      machine.recordObservation("finding", "Content", []);
      const snapshot = machine.getSnapshot();
      expect(snapshot.observations[0].importance).toBe(5);
    });

    it("should clamp importance to minimum 1", () => {
      machine.recordObservation("finding", "Content", [], -20);
      const snapshot = machine.getSnapshot();
      expect(snapshot.observations[0].importance).toBe(1);
    });

    it("should clamp importance to maximum 10", () => {
      machine.recordObservation("finding", "Content", [], 100);
      const snapshot = machine.getSnapshot();
      expect(snapshot.observations[0].importance).toBe(10);
    });

    it("should record timestamp", () => {
      const before = new Date();
      machine.recordObservation("metric", "Value: 42", []);
      const after = new Date();
      const snapshot = machine.getSnapshot();
      const timestamp = snapshot.observations[0].timestamp;
      expect(timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(timestamp.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it("should update updatedAt", () => {
      const before = new Date();
      machine.recordObservation("metric", "Value", []);
      const after = new Date();
      const snapshot = machine.getSnapshot();
      expect(snapshot.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(snapshot.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("setMetadata()", () => {
    it("should store metadata key-value", () => {
      machine.setMetadata("author", "John Doe");
      const snapshot = machine.getSnapshot();
      expect(snapshot.metadata["author"]).toBe("John Doe");
    });

    it("should update existing metadata key", () => {
      machine.setMetadata("version", 1);
      machine.setMetadata("version", 2);
      const snapshot = machine.getSnapshot();
      expect(snapshot.metadata["version"]).toBe(2);
    });

    it("should support various value types", () => {
      machine.setMetadata("string", "value");
      machine.setMetadata("number", 42);
      machine.setMetadata("boolean", true);
      machine.setMetadata("object", { nested: "value" });
      machine.setMetadata("array", [1, 2, 3]);
      const snapshot = machine.getSnapshot();
      expect(snapshot.metadata["string"]).toBe("value");
      expect(snapshot.metadata["number"]).toBe(42);
      expect(snapshot.metadata["boolean"]).toBe(true);
      expect(snapshot.metadata["object"]).toEqual({ nested: "value" });
      expect(snapshot.metadata["array"]).toEqual([1, 2, 3]);
    });

    it("should update updatedAt", () => {
      const before = new Date();
      machine.setMetadata("key", "value");
      const after = new Date();
      const snapshot = machine.getSnapshot();
      expect(snapshot.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(snapshot.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("searchObservations()", () => {
    beforeEach(() => {
      machine.recordObservation("finding", "Found critical bug", ["bug", "critical"], 9);
      machine.recordObservation("insight", "Performance issue detected", ["performance"], 7);
      machine.recordObservation("warning", "Low importance note", ["note"], 2);
      machine.recordObservation("metric", "API response time 200ms", ["metric", "api"], 5);
    });

    it("should return all observations when no keywords provided", () => {
      const results = machine.searchObservations([]);
      expect(results).toHaveLength(4);
    });

    it("should return all observations when no filters applied", () => {
      const results = machine.searchObservations([], 1);
      expect(results).toHaveLength(4);
    });

    it("should filter by keyword in keywords array", () => {
      const results = machine.searchObservations(["critical"]);
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain("critical bug");
    });

    it("should filter by multiple keywords (OR logic)", () => {
      const results = machine.searchObservations(["bug", "performance"]);
      expect(results).toHaveLength(2);
    });

    it("should filter by keyword in content (case-insensitive)", () => {
      const results = machine.searchObservations(["issue"]);
      expect(results).toHaveLength(1);
      expect(results[0].content).toContain("issue");
    });

    it("should filter by minImportance", () => {
      const results = machine.searchObservations([], 5);
      expect(results).toHaveLength(2);
      expect(results.every(obs => obs.importance >= 5)).toBe(true);
    });

    it("should filter by keyword AND minImportance", () => {
      const results = machine.searchObservations(["bug", "performance", "metric"], 6);
      expect(results).toHaveLength(2);
      expect(results[0].importance).toBeGreaterThanOrEqual(6);
    });

    it("should return empty array when no matches", () => {
      const results = machine.searchObservations(["nonexistent"]);
      expect(results).toEqual([]);
    });

    it("should return empty array when minImportance filters all", () => {
      const results = machine.searchObservations([], 10);
      expect(results).toEqual([]);
    });
  });

  describe("getDecisions()", () => {
    beforeEach(() => {
      machine.transition("discover", "Start discovery");
      machine.recordDecision("Decision 1", "In discover phase");
      machine.transition("define", "Move to define");
      machine.recordDecision("Decision 2", "In define phase");
      machine.recordDecision("Decision 3", "Also in define phase");
    });

    it("should return all decisions when no phase specified", () => {
      const decisions = machine.getDecisions();
      expect(decisions).toHaveLength(3);
    });

    it("should filter decisions by phase", () => {
      const defineDecisions = machine.getDecisions("define");
      expect(defineDecisions).toHaveLength(2);
      expect(defineDecisions.every(d => d.phase === "define")).toBe(true);
    });

    it("should return empty array for phase with no decisions", () => {
      const decisions = machine.getDecisions("deliver");
      expect(decisions).toEqual([]);
    });

    it("should return copy of decisions (not reference)", () => {
      const decisions1 = machine.getDecisions();
      const decisions2 = machine.getDecisions();
      expect(decisions1).not.toBe(decisions2);
      expect(decisions1).toEqual(decisions2);
    });
  });

  describe("getSnapshot()", () => {
    it("should return snapshot with all fields", () => {
      machine.transition("discover", "Start");
      machine.recordDecision("Decision", "Desc");
      machine.recordObservation("finding", "Content", ["kw"]);
      machine.setMetadata("key", "value");

      const snapshot = machine.getSnapshot();
      expect(snapshot.id).toBeDefined();
      expect(snapshot.phase).toBe("discover");
      expect(snapshot.projectId).toBe(testProjectId);
      expect(snapshot.startedAt).toBeInstanceOf(Date);
      expect(snapshot.updatedAt).toBeInstanceOf(Date);
      expect(snapshot.metadata).toEqual({ key: "value" });
      expect(snapshot.decisions).toHaveLength(1);
      expect(snapshot.observations).toHaveLength(1);
      expect(snapshot.phaseHistory).toHaveLength(1);
    });

    it("should return immutable copy", () => {
      const snapshot = machine.getSnapshot();
      expect(Object.isFrozen(snapshot)).toBe(false);
      // Modifications to snapshot should not affect machine state
      snapshot.metadata["test"] = "should not persist";
      const snapshot2 = machine.getSnapshot();
      expect(snapshot2.metadata).not.toHaveProperty("test");
    });
  });

  describe("phase getter", () => {
    it("should return current phase", () => {
      expect(machine.phase).toBe("idle");
      machine.transition("discover", "Start");
      expect(machine.phase).toBe("discover");
      machine.transition("define", "Next");
      expect(machine.phase).toBe("define");
    });
  });

  describe("sessionId getter", () => {
    it("should return session ID", () => {
      const id = machine.sessionId;
      expect(id).toBeDefined();
      expect(typeof id).toBe("string");
    });

    it("should return same ID consistently", () => {
      const id1 = machine.sessionId;
      const id2 = machine.sessionId;
      expect(id1).toBe(id2);
    });
  });

  describe("getValidTransitions()", () => {
    it("should return valid transitions from idle", () => {
      const valid = machine.getValidTransitions();
      expect(valid).toEqual(["discover", "define", "develop", "review"]);
    });

    it("should return valid transitions from discover", () => {
      machine.transition("discover", "Start");
      const valid = machine.getValidTransitions();
      expect(valid).toEqual(["define", "review", "failed"]);
    });

    it("should return valid transitions from define", () => {
      machine.transition("discover", "Start");
      machine.transition("define", "Next");
      const valid = machine.getValidTransitions();
      expect(valid).toEqual(["develop", "review", "failed"]);
    });

    it("should return valid transitions from develop", () => {
      machine.transition("discover", "Start");
      machine.transition("define", "Next");
      machine.transition("develop", "Next");
      const valid = machine.getValidTransitions();
      expect(valid).toEqual(["deliver", "review", "remediate", "failed"]);
    });

    it("should return valid transitions from deliver", () => {
      machine.transition("discover", "Start");
      machine.transition("define", "Next");
      machine.transition("develop", "Next");
      machine.transition("deliver", "Next");
      const valid = machine.getValidTransitions();
      expect(valid).toEqual(["complete", "remediate", "failed"]);
    });

    it("should return valid transitions from review", () => {
      machine.transition("discover", "Start");
      machine.transition("review", "Review");
      const valid = machine.getValidTransitions();
      expect(valid).toEqual(["develop", "remediate", "complete", "failed"]);
    });

    it("should return valid transitions from remediate", () => {
      machine.transition("discover", "Start");
      machine.transition("define", "Next");
      machine.transition("develop", "Next");
      machine.transition("deliver", "Next");
      machine.transition("remediate", "Fix issues");
      const valid = machine.getValidTransitions();
      expect(valid).toEqual(["develop", "deliver", "review", "failed"]);
    });

    it("should return valid transitions from complete", () => {
      machine.transition("discover", "Start");
      machine.transition("define", "Next");
      machine.transition("develop", "Next");
      machine.transition("deliver", "Next");
      machine.transition("complete", "Done");
      const valid = machine.getValidTransitions();
      expect(valid).toEqual(["idle"]);
    });

    it("should return valid transitions from failed", () => {
      machine.transition("discover", "Start");
      machine.transition("failed", "Failed");
      const valid = machine.getValidTransitions();
      expect(valid).toEqual(["idle", "remediate"]);
    });
  });

  describe("canTransition()", () => {
    it("should return true for valid transition", () => {
      expect(machine.canTransition("discover")).toBe(true);
      expect(machine.canTransition("define")).toBe(true);
    });

    it("should return false for invalid transition", () => {
      expect(machine.canTransition("deliver")).toBe(false);
      expect(machine.canTransition("complete")).toBe(false);
    });

    it("should update validity based on phase", () => {
      expect(machine.canTransition("define")).toBe(true);
      machine.transition("discover", "Start");
      expect(machine.canTransition("define")).toBe(true);
      expect(machine.canTransition("develop")).toBe(false);
      machine.transition("define", "Next");
      expect(machine.canTransition("develop")).toBe(true);
      expect(machine.canTransition("deliver")).toBe(false);
    });
  });

  describe("save() and restore()", () => {
    it("should persist state to store via save()", async () => {
      machine.transition("discover", "Start");
      machine.recordDecision("Decision", "Desc");
      await machine.save();

      const saved = await store.load(machine.sessionId);
      expect(saved).toBeDefined();
      expect(saved?.phase).toBe("discover");
      expect(saved?.decisions).toHaveLength(1);
    });

    it("should restore state from store via restore()", async () => {
      const sessionId = machine.sessionId;
      machine.transition("discover", "Start");
      machine.recordDecision("Decision", "Desc", 8);
      await machine.save();

      const newMachine = new SessionStateMachine(store, testProjectId, sessionId);
      const restored = await newMachine.restore(sessionId);
      expect(restored).toBe(true);
      expect(newMachine.phase).toBe("discover");
      expect(newMachine.getDecisions()).toHaveLength(1);
      expect(newMachine.getDecisions()[0].importance).toBe(8);
    });

    it("should return false when restoring non-existent session", async () => {
      const restored = await machine.restore("non-existent-id");
      expect(restored).toBe(false);
    });

    it("should maintain full state across save/restore cycle", async () => {
      const sessionId = machine.sessionId;
      machine.transition("discover", "Start discovery");
      machine.transition("define", "Start definition");
      machine.recordDecision("Important decision", "Description", 9);
      machine.recordObservation("finding", "Critical finding", ["critical"], 8);
      machine.setMetadata("custom", { nested: "value" });
      await machine.save();

      const newMachine = new SessionStateMachine(store, testProjectId, sessionId);
      await newMachine.restore(sessionId);

      const snapshot = newMachine.getSnapshot();
      expect(snapshot.phase).toBe("define");
      expect(snapshot.phaseHistory).toHaveLength(2);
      expect(snapshot.decisions).toHaveLength(1);
      expect(snapshot.observations).toHaveLength(1);
      expect(snapshot.metadata["custom"]).toEqual({ nested: "value" });
    });
  });

  describe("Full lifecycle: idle → discover → define → develop → deliver → complete → idle", () => {
    it("should complete full cycle", async () => {
      expect(machine.phase).toBe("idle");

      machine.transition("discover", "Starting discovery");
      expect(machine.phase).toBe("discover");

      machine.transition("define", "Moving to define");
      expect(machine.phase).toBe("define");

      machine.transition("develop", "Starting development");
      expect(machine.phase).toBe("develop");

      machine.transition("deliver", "Ready to deliver");
      expect(machine.phase).toBe("deliver");

      machine.transition("complete", "Completed");
      expect(machine.phase).toBe("complete");

      machine.transition("idle", "Resetting");
      expect(machine.phase).toBe("idle");

      const snapshot = machine.getSnapshot();
      expect(snapshot.phaseHistory).toHaveLength(6);
    });

    it("should record all transitions with reasons", async () => {
      machine.transition("discover", "Reason 1");
      machine.transition("define", "Reason 2");
      machine.transition("develop", "Reason 3");
      machine.transition("deliver", "Reason 4");
      machine.transition("complete", "Reason 5");
      machine.transition("idle", "Reason 6");

      const snapshot = machine.getSnapshot();
      expect(snapshot.phaseHistory[0].reason).toBe("Reason 1");
      expect(snapshot.phaseHistory[5].reason).toBe("Reason 6");
    });
  });
});

describe("InMemoryStateStore", () => {
  let store: InMemoryStateStore;

  beforeEach(() => {
    store = new InMemoryStateStore();
  });

  describe("save() and load()", () => {
    it("should persist and retrieve state by ID", async () => {
      const snapshot: SessionSnapshot = {
        id: "test-session-1",
        phase: "discover",
        projectId: "project-1",
        startedAt: new Date(),
        updatedAt: new Date(),
        metadata: { key: "value" },
        decisions: [],
        observations: [],
        phaseHistory: [],
      };

      await store.save(snapshot);
      const loaded = await store.load("test-session-1");

      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe("test-session-1");
      expect(loaded?.phase).toBe("discover");
      expect(loaded?.metadata).toEqual({ key: "value" });
    });

    it("should update existing state on save", async () => {
      const snapshot: SessionSnapshot = {
        id: "test-session-1",
        phase: "idle",
        projectId: "project-1",
        startedAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        decisions: [],
        observations: [],
        phaseHistory: [],
      };

      await store.save(snapshot);
      const loaded1 = await store.load("test-session-1");
      expect(loaded1?.phase).toBe("idle");

      snapshot.phase = "discover";
      await store.save(snapshot);
      const loaded2 = await store.load("test-session-1");
      expect(loaded2?.phase).toBe("discover");
    });

    it("should return null for unknown session ID", async () => {
      const loaded = await store.load("unknown-id");
      expect(loaded).toBeNull();
    });

    it("should store independent copies (not references)", async () => {
      const snapshot: SessionSnapshot = {
        id: "test-session-1",
        phase: "idle",
        projectId: "project-1",
        startedAt: new Date(),
        updatedAt: new Date(),
        metadata: { key: "original" },
        decisions: [],
        observations: [],
        phaseHistory: [],
      };

      await store.save(snapshot);
      snapshot.metadata["key"] = "modified";

      const loaded = await store.load("test-session-1");
      expect(loaded?.metadata["key"]).toBe("original");
    });
  });

  describe("list()", () => {
    it("should list all sessions for a project", async () => {
      const snapshot1: SessionSnapshot = {
        id: "session-1",
        phase: "idle",
        projectId: "project-1",
        startedAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        decisions: [],
        observations: [],
        phaseHistory: [],
      };

      const snapshot2: SessionSnapshot = {
        id: "session-2",
        phase: "discover",
        projectId: "project-1",
        startedAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        decisions: [],
        observations: [],
        phaseHistory: [],
      };

      await store.save(snapshot1);
      await store.save(snapshot2);

      const sessions = await store.list("project-1");
      expect(sessions).toHaveLength(2);
      expect(sessions.map(s => s.id)).toContain("session-1");
      expect(sessions.map(s => s.id)).toContain("session-2");
    });

    it("should filter by projectId", async () => {
      const snapshot1: SessionSnapshot = {
        id: "session-1",
        phase: "idle",
        projectId: "project-1",
        startedAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        decisions: [],
        observations: [],
        phaseHistory: [],
      };

      const snapshot2: SessionSnapshot = {
        id: "session-2",
        phase: "idle",
        projectId: "project-2",
        startedAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
        decisions: [],
        observations: [],
        phaseHistory: [],
      };

      await store.save(snapshot1);
      await store.save(snapshot2);

      const project1Sessions = await store.list("project-1");
      const project2Sessions = await store.list("project-2");

      expect(project1Sessions).toHaveLength(1);
      expect(project1Sessions[0].projectId).toBe("project-1");
      expect(project2Sessions).toHaveLength(1);
      expect(project2Sessions[0].projectId).toBe("project-2");
    });

    it("should return empty array for unknown projectId", async () => {
      const sessions = await store.list("unknown-project");
      expect(sessions).toEqual([]);
    });

    it("should return independent copies", async () => {
      const snapshot: SessionSnapshot = {
        id: "session-1",
        phase: "idle",
        projectId: "project-1",
        startedAt: new Date(),
        updatedAt: new Date(),
        metadata: { key: "value" },
        decisions: [],
        observations: [],
        phaseHistory: [],
      };

      await store.save(snapshot);
      const sessions = await store.list("project-1");
      sessions[0].metadata["key"] = "modified";

      const sessions2 = await store.list("project-1");
      expect(sessions2[0].metadata["key"]).toBe("value");
    });
  });
});

describe("State Machine Transitions Validation", () => {
  const transitionMap: Record<SessionPhase, SessionPhase[]> = {
    idle: ["discover", "define", "develop", "review"],
    discover: ["define", "review", "failed"],
    define: ["develop", "review", "failed"],
    develop: ["deliver", "review", "remediate", "failed"],
    deliver: ["complete", "remediate", "failed"],
    review: ["develop", "remediate", "complete", "failed"],
    remediate: ["develop", "deliver", "review", "failed"],
    complete: ["idle"],
    failed: ["idle", "remediate"],
  };

  it("should have 9 phases defined", () => {
    const phases: SessionPhase[] = [
      "idle",
      "discover",
      "define",
      "develop",
      "deliver",
      "review",
      "remediate",
      "complete",
      "failed",
    ];
    expect(Object.keys(transitionMap)).toHaveLength(phases.length);
  });

  it("should validate all transitions match expected map", () => {
    const store = new InMemoryStateStore();
    const phases: SessionPhase[] = Object.keys(transitionMap) as SessionPhase[];

    phases.forEach(fromPhase => {
      const machine = new SessionStateMachine(store, "test", `session-${fromPhase}`);
      const testMachine = machine as any;

      // Manually transition to test phase (except idle which starts there)
      if (fromPhase !== "idle") {
        const path = findPath("idle", fromPhase, transitionMap);
        if (path) {
          for (let i = 1; i < path.length; i++) {
            machine.transition(path[i], "test");
          }
        }
      }

      const validTransitions = machine.getValidTransitions();
      const expected = transitionMap[fromPhase] || [];
      expect(validTransitions).toEqual(expected);
    });
  });

  it("should allow all expected transitions from idle", () => {
    const store = new InMemoryStateStore();
    const machine = new SessionStateMachine(store, "test");
    const expected = ["discover", "define", "develop", "review"];
    expect(machine.getValidTransitions()).toEqual(expected);
  });
});

// Helper function to find a path between two phases
function findPath(
  from: SessionPhase,
  to: SessionPhase,
  transitionMap: Record<SessionPhase, SessionPhase[]>
): SessionPhase[] | null {
  if (from === to) return [from];

  const visited = new Set<SessionPhase>();
  const queue: Array<{ phase: SessionPhase; path: SessionPhase[] }> = [
    { phase: from, path: [from] },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.phase)) continue;
    visited.add(current.phase);

    const allowed = transitionMap[current.phase] || [];
    for (const next of allowed) {
      if (next === to) {
        return [...current.path, next];
      }
      queue.push({ phase: next, path: [...current.path, next] });
    }
  }

  return null;
}

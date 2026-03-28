---
name: systematic-debugging
description: Use when the user is stuck debugging, encountering unexpected behavior, dealing with intermittent failures, race conditions, memory leaks, or says things like 'I can not figure this out', 'why is this failing', 'this does not work', or 'help me debug'.
---

# Systematic Debugging

**Rule: NEVER jump to a fix without completing Phases 1-3.**

Guessing wastes more time than observing. Every minute spent in Phase 1-2 saves ten in Phase 3-4.

## Phase 1: OBSERVE

Gather ALL available data before forming any theory:

- **Error messages** — Read the FULL stack trace, not just the first line
- **Logs** — Check application logs, system logs, CI/CD logs
- **State** — What are the actual values? Use debugger, console.log, or inspect
- **Timeline** — When did it start? What changed? Check recent commits (`git log -10`)
- **Environment** — Is it only in this environment? Compare dev/staging/prod
- **Reproduction** — Can you reproduce reliably? If intermittent, what varies?

**Output**: A factual description of what IS happening (not what SHOULD happen).

## Phase 2: HYPOTHESIZE

Form at most 3 hypotheses ranked by likelihood:

1. **Most likely** — Based on the evidence from Phase 1
2. **Alternative** — What if the evidence is misleading?
3. **Unlikely but dangerous** — What if it's a deeper systemic issue?

For each hypothesis, identify the MINIMAL test to confirm or eliminate it.

**Anti-pattern**: Do NOT stop at 1 hypothesis. Confirmation bias is the #1 debugging trap.

## Phase 3: TEST

Test each hypothesis **in isolation**:

- Change ONE variable at a time
- Use binary search for large codebases (`git bisect`)
- Write a minimal reproduction test if one doesn't exist
- **If the test is inconclusive** — your hypothesis is wrong. Return to Phase 2.

**Output**: One confirmed root cause with evidence.

## Phase 4: FIX

Now — and ONLY now — implement the fix:

1. **Fix the root cause**, not the symptom
2. **Write a regression test** that fails without the fix
3. **Run the full test suite** — fixes that break other things aren't fixes
4. **Run Sentinel validation** — `SentinelAdapter.validate()` to verify quality
5. **Document** — What was the root cause? Why did it happen? How was it found?

## Defense in Depth

After fixing, add instrumentation to prevent recurrence:
- Add logging at the failure point
- Add a health check or assertion
- Update monitoring/alerts if applicable
- Add the scenario to the test suite

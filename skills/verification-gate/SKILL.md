---
name: verification-gate
description: Use when completing any task that claims tests pass, builds succeed, bugs are fixed, or requirements are met. Activates before any completion claim to ensure fresh evidence exists.
---

# Verification Gate

## The Iron Law

**NO COMPLETION CLAIMS WITHOUT FRESH EVIDENCE.**

If you haven't run it, read the output, and verified the result in THIS session — you don't know it works.

## Gate Process

### 1. IDENTIFY
What is being claimed? Map each claim to its verification method:

| Claim | Required Evidence |
|-------|------------------|
| "Tests pass" | `npm test` output showing 0 failures |
| "Build succeeds" | `tsc --build` or `npm run build` with exit code 0 |
| "Bug is fixed" | Reproduce steps → fix → re-run → passes |
| "Feature works" | Execute the feature, verify output matches spec |
| "No regressions" | Full test suite passes, not just new tests |

### 2. RUN
Execute the verification command. **Do not skip this step.** Do not rely on cached results. Run it NOW.

### 3. READ
Read the ACTUAL output. Do not assume success. Look for:
- Exit codes
- Error messages buried in warnings
- Partial failures masked by summary lines

### 4. VERIFY
Compare output against the claim. Does the evidence FULLY support the claim? If partial — the claim is partial.

### 5. CLAIM
Only now state the claim, citing the evidence. Format: "Verified: [claim] — [evidence summary]."

## Red Flags (STOP if you catch yourself saying these)

- "It should work" — Run it.
- "I'm confident that..." — Show the evidence.
- "Based on the code, it will..." — Execute it.
- "Just this one time..." — Especially this time.
- "The tests probably pass" — Run them.

## Sentinel Integration

When the claim involves code quality or security, invoke `SentinelAdapter.validate()` as part of Step 2 (RUN). The Sentinel's 7 validators provide independent verification.

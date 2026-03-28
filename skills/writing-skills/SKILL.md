---
name: writing-skills
description: Use when creating a new Nexus skill, improving an existing skill, or when someone asks how to write a Nexus skill. Activates on mentions of skill creation, skill authoring, or SKILL.md files.
---

# Writing Skills — TDD for Documentation

## The TDD Loop for Skills

### 1. RED — The Agent Fails Without the Skill
Before writing the skill, prove the gap exists:
- Run the agent on a task the skill should handle
- Document where the agent fails, shortcuts, or produces low-quality output
- This is your **failing test** — the skill must fix this behavior

### 2. GREEN — The Skill Corrects the Agent
Write the SKILL.md following `docs/skill-spec.md`:
- **Frontmatter**: `name` (kebab-case) + `description` (trigger conditions only)
- **Iron Law or Core Rule**: The non-negotiable principle
- **Process**: Step-by-step instructions
- **Integration**: How it connects to Nexus components
- **Checklist**: Self-review items

Re-run the agent with the skill loaded. It should now produce quality output.

### 3. REFACTOR — Tighten and Optimize
- Count words — are you within the token budget?
- Remove redundancy — every sentence must add value
- Test the description — does the agent trigger the skill at the right moments?
- Test under pressure — does the skill hold when the agent has time pressure, sunk cost, or authority override?

## Token Budgets (from `docs/skill-spec.md`)

| Type | Max Words | Example |
|------|-----------|---------|
| Getting Started | 150 | using-nexus |
| Frequent | 200 | verification-gate |
| Process | 500 | architecture-review, debugging |
| Reference | 800 | writing-skills |

## Testing Discipline-Enforcing Skills

The hardest skills to test are those that enforce discipline (like verification-gate). Test with **pressure scenarios**:

1. **Time pressure**: "We need this shipped today" — does the skill still enforce all steps?
2. **Sunk cost**: "I've already spent 3 hours on this" — does the agent skip verification?
3. **Authority**: "The tech lead said it's fine" — does the agent bypass the gate?

If the skill breaks under any of these, add explicit counters to the SKILL.md.

## Checklist for Every New Skill

- [ ] Frontmatter YAML is valid
- [ ] Description = only trigger conditions (never workflow summary)
- [ ] Within token budget for its type
- [ ] References `docs/skill-spec.md` conventions
- [ ] Tested with TDD: RED → GREEN → REFACTOR
- [ ] No placeholders, TODOs, or vague "add appropriate handling"

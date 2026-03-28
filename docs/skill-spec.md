# Nexus Skill Specification

> Defines the format, conventions, and quality standards for Nexus skills.

## File Format

Skills live in `/skills/{skill-name}/SKILL.md` and use YAML frontmatter:

```yaml
---
name: skill-name-in-kebab-case
description: Trigger conditions only. Never summarize the workflow.
---

# Skill Title
[Skill content — instructions, rules, checklists]
```

## CSO Rules (Claude Search Optimization)

- **`description`** = ONLY trigger conditions (max 500 chars, third person)
- **Never** summarize the workflow in the description
- Claude follows the description instead of reading SKILL.md — keep it focused on WHEN to activate

## Token Budgets

| Skill Type | Max Words | Max Tokens | Example |
|-----------|-----------|------------|---------|
| Frequent | 200 | ~270 | verification-gate, using-nexus |
| Process | 500 | ~675 | architecture-review, debugging |
| Reference | 800 | ~1080 | writing-skills |
| Getting Started | 150 | ~200 | using-nexus |

Budgets are **guidelines** — log warnings, never hard-block.

## Structure

```markdown
---
name: my-skill
description: Use when [trigger conditions].
---

# Skill Title

## Core Rule / Iron Law
[The non-negotiable principle]

## Process
[Step-by-step instructions]

## Integration
[How this skill connects with Nexus components]

## Checklist
[Self-review items]
```

## Testing Skills (TDD for Docs)

1. **RED**: Agent fails or produces low-quality output without the skill
2. **GREEN**: With the skill, agent follows the process and produces quality output
3. **REFACTOR**: Tighten wording, reduce token count, improve trigger accuracy

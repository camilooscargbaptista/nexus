# Nexus — OpenCode Installation

## Quick Setup

```bash
# Install globally
npm install -g @nexus/cli

# Or add to your project
npm install --save-dev @nexus/cli
```

## Configuration

Add to your OpenCode config:

```json
{
  "plugins": {
    "nexus": {
      "path": "node_modules/@nexus/cli",
      "skills": "./skills/",
      "autoInject": true
    }
  }
}
```

## Usage

Once configured, Nexus skills are available in your OpenCode sessions:

- **Architecture Review** — Full pipeline: Architect → CTO Toolkit → Sentinel
- **Verification Gate** — Evidence-based completion verification
- **Systematic Debugging** — 4-phase structured debugging

## CLI Commands

```bash
nexus analyze .    # Full codebase analysis
nexus score .      # Quick architecture score
nexus status       # Current health overview
nexus history      # Trend tracking over time
```

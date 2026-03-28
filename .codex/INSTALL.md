# Nexus — Codex Installation

## Quick Setup

```bash
# Clone the repo (if not already)
git clone https://github.com/camilooscargbaptista/nexus.git ~/.nexus

# Symlink into your Codex plugins directory
ln -sf ~/.nexus ~/.codex/plugins/nexus

# Install dependencies
cd ~/.nexus && npm install && npm run build
```

## Usage

Once installed, Nexus skills are available in your Codex sessions:

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

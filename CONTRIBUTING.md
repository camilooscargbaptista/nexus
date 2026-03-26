# Contributing to Nexus

Thank you for considering contributing to Nexus! This guide will help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Commit Conventions](#commit-conventions)
- [Pull Requests](#pull-requests)
- [Code Style](#code-style)

## Code of Conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/YOUR_USERNAME/nexus.git`
3. **Create a branch**: `git checkout -b feature/your-feature`
4. **Make your changes**
5. **Push** and open a **Pull Request**

## Development Setup

### Prerequisites

- **Node.js** ≥ 18.0.0 (see `.nvmrc`)
- **npm** ≥ 9.0.0

### Install & Run

```bash
# Install dependencies (monorepo workspaces)
npm install

# Run all 909 tests
npx jest

# Run tests for a specific package
npx jest --testPathPattern=packages/core

# Type-check all packages
npm run build
```

### Project Structure

```
nexus/
├── packages/
│   ├── types/       # Shared type system (@nexus/types)
│   ├── events/      # Event bus (@nexus/events)
│   ├── core/        # Engine: Orchestrator, ProviderMesh, ModelRouter
│   ├── bridge/      # Integration: Pipeline, Adapters, DarkFactory
│   ├── autonomy/    # Self-healing: Remediation, Debt Prevention
│   ├── cloud/       # Backend API (Express + Prisma)
│   ├── dashboard/   # Frontend (React 18 + Tailwind)
│   ├── mcp/         # MCP Protocol servers
│   ├── cli/         # CLI tool
│   └── app/         # GitHub App
├── examples/        # Integration examples
└── jest.config.js   # Root test configuration
```

## Making Changes

### Branching Strategy (Git Flow)

- `main` — production releases
- `develop` — integration branch
- `feature/*` — new features
- `fix/*` — bug fixes
- `hotfix/*` — urgent production fixes

**Never commit directly to `main` or `develop`.**

### Package Dependencies

Dependencies flow in one direction:

```
types → events → core → bridge → autonomy
                   ↓        ↓
                 cloud    mcp / cli / app
```

When modifying `@nexus/types`, all downstream packages are affected — test thoroughly.

## Commit Conventions

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new skill to ToolkitRouter
fix: correct determineTrend logic in NexusPipeline
docs: update README with new CLI commands
test: add Tribunal consensus edge cases
refactor: extract ProviderMesh cost tracking
perf: optimize topological sort in Orchestrator
chore: update TypeScript to 6.x
```

### Scope (optional)

```
feat(core): add LearningEngine feedback loop
fix(bridge): handle null perception in pipeline
test(autonomy): add RemediationEngine rollback tests
```

## Pull Requests

1. **Title**: Use Conventional Commits format
2. **Description**: Explain what and why, not just how
3. **Tests**: All existing tests must pass. Add new tests for new features
4. **Types**: No `any` without justification
5. **Docs**: Update JSDoc for public API changes

### PR Checklist

- [ ] Tests pass (`npx jest`)
- [ ] No new `any` types without comment
- [ ] JSDoc for new public APIs
- [ ] CHANGELOG.md updated (for features/fixes)
- [ ] No secrets or credentials committed

## Code Style

- **TypeScript strict mode** — always
- **ESM modules** — `import/export`, no `require()`
- **2-space indentation**
- **Trailing commas** in multi-line structures
- **JSDoc** on all exported functions, classes, and interfaces
- **English** for code (variables, functions, classes)
- **Portuguese (BR)** for comments and documentation (optional)

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Files | kebab-case | `provider-mesh.ts` |
| Classes | PascalCase | `ProviderMesh` |
| Interfaces | PascalCase | `MeshProvider` |
| Functions | camelCase | `getAvailableProviders()` |
| Constants | UPPER_SNAKE | `DEFAULT_CONFIG` |
| Enums | PascalCase | `NexusEventType` |
| Test files | `*.test.ts` | `provider-mesh.test.ts` |

## Questions?

Open an issue or reach out to [camilo.baptista@girardellitecnologia.com](mailto:camilo.baptista@girardellitecnologia.com).

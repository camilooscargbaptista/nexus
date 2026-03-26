# Nexus — Production-Ready Polish + Bug Fixes

Plano unificado combinando:
1. **Bugs encontrados** na minha análise profunda
2. **Gaps de production-readiness** do audit externo

## User Review Required

> [!IMPORTANT]
> O plano cria uma feature branch `feature/production-ready-polish` a partir de `main` e organiza tudo em **3 commits** para histórico limpo.

> [!WARNING]
> A licença BSL 1.1 mencionada no README será criada como arquivo `LICENSE`. Confirmar se o texto da BSL 1.1 com change date de 4 anos está correto.

---

## Proposed Changes

### Commit 1: Bug Fixes (da análise profunda)

---

#### [MODIFY] [nexus-pipeline.ts](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/packages/bridge/src/nexus-pipeline.ts)

1. **Linha 44** — Fix `DefaultPipelineLogger.info()`: `this.logger.info(...)` → `console.info(...)`
2. **Linhas 162-163** — Tratar `perception!` e `validation!` com safe defaults (snapshot vazio) em vez de non-null assertion
3. **Linhas 320-328** — [determineTrend()](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/packages/bridge/src/nexus-pipeline.ts#316-329) nunca retorna `"improving"` — corrigir lógica; se health > 75 → improving, 50-75 → stable, <50 → degrading

#### [MODIFY] [index.ts (CLI)](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/packages/cli/src/index.ts)

4. **Linha 166** — `eventBus.subscribe("*" as any, ...)` → `eventBus.on("*" as any, ...)`

---

### Commit 2: OSS Infrastructure (do audit)

---

#### [NEW] [LICENSE](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/LICENSE)

Arquivo BSL 1.1 completo conforme descrito no README (free <$1M, change date 4 anos → Apache 2.0).

---

#### [NEW] [CONTRIBUTING.md](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/CONTRIBUTING.md)

Guia de contribuição: setup local, convenções de commit (Conventional Commits), branching strategy (Git Flow), PR guidelines, code style.

---

#### [NEW] [CHANGELOG.md](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/CHANGELOG.md)

Changelog v0.1.0 com todos os pacotes e features implementados nos Sprints 1-10. Formato Keep a Changelog.

---

#### [NEW] [SECURITY.md](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/SECURITY.md)

Política de segurança: como reportar vulnerabilidades, escopo, PGP key (placeholder).

---

#### [NEW] [CODE_OF_CONDUCT.md](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/CODE_OF_CONDUCT.md)

Contributor Covenant v2.1.

---

#### [NEW] [.env.example](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/packages/cloud/.env.example)

Baseado no [config.ts](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/packages/cloud/src/config.ts) existente (PORT, NODE_ENV, DATABASE_URL, JWT_SECRET, JWT_EXPIRES_IN, CORS_ORIGINS, LOG_LEVEL, ANTHROPIC_API_KEY).

---

#### [NEW] [.nvmrc](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/.nvmrc)

Node 18 LTS.

---

#### [MODIFY] [.gitignore](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/.gitignore)

Expandir com: `dist/`, `.env`, `coverage/`, `.DS_Store`, `*.tsbuildinfo`, `.turbo/`.

---

### Commit 3: DX Tooling (CI/CD + Linting + Templates)

---

#### [NEW] [ci.yml](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/.github/workflows/ci.yml)

GitHub Actions workflow: lint + typecheck + test (909 testes) em Node 18/20, matrix strategy.

---

#### [NEW] [eslint.config.js](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/eslint.config.js)

ESLint flat config com `@typescript-eslint`, regras sensatas para o projeto (sem no-any rígido por agora — vários `as any` existentes).

---

#### [NEW] [.prettierrc](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/.prettierrc)

Prettier config: 2 spaces, trailing commas, 100 print width.

---

#### [NEW] [bug_report.yml](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/.github/ISSUE_TEMPLATE/bug_report.yml)

Template de issue para bugs com campos estruturados (YAML form).

---

#### [NEW] [feature_request.yml](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/.github/ISSUE_TEMPLATE/feature_request.yml)

Template de issue para feature requests.

---

#### [NEW] [pull_request_template.md](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/.github/pull_request_template.md)

Template de PR com checklist (tests, docs, breaking changes).

---

## Verification Plan

### Automated Tests

Os 909 testes existentes devem continuar passando após os bug fixes:

```bash
cd /Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus
npx jest --no-cache 2>&1 | tail -20
```

O teste mais relevante para os bug fixes está em [nexus-pipeline.test.ts](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/packages/bridge/src/__tests__/nexus-pipeline.test.ts) — testa o pipeline completo com mocks, e o [DefaultPipelineLogger](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/packages/bridge/src/nexus-pipeline.ts#43-49) é instanciado internamente pelo construtor quando nenhum logger é fornecido.

### Manual Verification

1. **Verificar que os arquivos criados existem** com `ls -la LICENSE CONTRIBUTING.md CHANGELOG.md SECURITY.md CODE_OF_CONDUCT.md .nvmrc .prettierrc eslint.config.js` e `ls -la .github/`
2. **Verificar .env.example** com `cat packages/cloud/.env.example` — deve ter todas as variáveis do [config.ts](file:///Users/camilooscargirardellibaptista/Documentos/camilo/girardelli_tecnologia/repository/nexus/packages/cloud/src/config.ts)
3. **Verificar CI workflow é válido** — revisar o YAML manualmente (não há como executar Actions localmente)

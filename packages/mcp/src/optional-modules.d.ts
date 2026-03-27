/**
 * Declarações de tipo para dependências opcionais (peer dependencies).
 *
 * Esses módulos são carregados via dynamic import apenas quando disponíveis.
 * As declarações permitem que o TypeScript compile sem instalação real.
 */

declare module "@girardelli/architect" {
  export function analyze(projectPath: string): unknown;
  export class GitHistoryAnalyzer {
    analyze(projectPath: string): unknown;
  }
  export class TemporalScorer {
    score(gitReport: unknown, staticScores: Map<string, number>): unknown;
  }
  export class ForecastEngine {
    forecast(gitReport: unknown, temporalReport: unknown): unknown;
  }
}

declare module "sentinel-method" {
  export function validate(projectPath: string, config?: unknown): unknown;
  export function validateWithConsensus(projectPath: string, config?: unknown): unknown;
}

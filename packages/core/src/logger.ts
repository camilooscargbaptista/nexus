/**
 * Logger — Injectable logging abstraction
 *
 * Follows ISP: 4 métodos focados. Nenhum log framework acoplado.
 * Default: ConsoleLogger (para dev). Em produção, injetar outro.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 * @license MIT
 */

// ═══════════════════════════════════════════════════════════════
// LOGGER INTERFACE
// ═══════════════════════════════════════════════════════════════

export interface Logger {
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

// ═══════════════════════════════════════════════════════════════
// CONSOLE LOGGER — Default implementation
// ═══════════════════════════════════════════════════════════════

export class ConsoleLogger implements Logger {
  private prefix: string;

  constructor(prefix = '') {
    this.prefix = prefix ? `[${prefix}] ` : '';
  }

  info(message: string, ...args: unknown[]): void {
    console.log(`${this.prefix}${message}`, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(`${this.prefix}${message}`, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    console.error(`${this.prefix}${message}`, ...args);
  }

  debug(message: string, ...args: unknown[]): void {
    console.debug(`${this.prefix}${message}`, ...args);
  }
}

// ═══════════════════════════════════════════════════════════════
// NULL LOGGER — Silent, for tests
// ═══════════════════════════════════════════════════════════════

export class NullLogger implements Logger {
  info(): void { /* noop */ }
  warn(): void { /* noop */ }
  error(): void { /* noop */ }
  debug(): void { /* noop */ }
}

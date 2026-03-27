/**
 * @nexus/bridge — AutoRegistry
 *
 * Convention-based skill discovery e registro automático.
 * Escaneia diretórios por *.skill.ts, carrega módulos e valida com SkillMetaSchema.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { SkillRegistry } from "./skill-registry.js";
import { validateSkillMeta } from "./skill-meta.js";
import type { SkillDescriptor } from "./skill-registry.js";
import type { SkillMeta } from "./skill-meta.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Interface que cada feature module deve implementar.
 * Convenção: exportar como default em arquivos *.skill.ts
 */
export interface FeatureModule {
  /** Metadata validada da skill */
  meta: SkillDescriptor;
  /** Callback de ativação — chamado quando a skill é selecionada */
  activate?: () => void | Promise<void>;
  /** Callback de desativação — cleanup */
  deactivate?: () => void | Promise<void>;
}

/** Resultado do discovery */
export interface DiscoveryResult {
  /** Skills registradas com sucesso */
  registered: SkillMeta[];
  /** Skills que falharam na validação */
  failed: { source: string; errors: string[] }[];
  /** Total de arquivos escaneados */
  scanned: number;
}

/** Entry do registro com metadata de origem */
interface RegistryEntry {
  meta: SkillMeta;
  module?: FeatureModule;
  source: "discovered" | "manual";
  registeredAt: number;
}

// ═══════════════════════════════════════════════════════════════
// AUTO REGISTRY
// ═══════════════════════════════════════════════════════════════

export class AutoRegistry extends SkillRegistry {
  private entries: Map<string, RegistryEntry> = new Map();

  /**
   * Registra skills a partir de FeatureModules com validação.
   * Ideal para quando os módulos já foram importados.
   */
  registerFromModules(
    modules: FeatureModule[],
    source: "discovered" | "manual" = "manual",
  ): DiscoveryResult {
    const result: DiscoveryResult = {
      registered: [],
      failed: [],
      scanned: modules.length,
    };

    for (const mod of modules) {
      const validation = validateSkillMeta(mod.meta);

      if (!validation.success) {
        result.failed.push({
          source: mod.meta?.name ?? "unknown",
          errors: validation.errors?.map((e) => `${e.field}: ${e.message}`) ?? [],
        });
        continue;
      }

      const meta = validation.data!;

      // Dedup: skip se já registrado
      if (this.entries.has(meta.name)) {
        continue;
      }

      // Registra no SkillRegistry pai
      super.register(meta as SkillDescriptor);

      // Guarda entry com metadata
      this.entries.set(meta.name, {
        meta,
        module: mod,
        source,
        registeredAt: Date.now(),
      });

      result.registered.push(meta);
    }

    return result;
  }

  /**
   * Descobre skills escaneando módulos já carregados.
   * Para uso com dynamic import() externo:
   *
   * ```ts
   * const modules = await loadModulesFromDir('./skills');
   * registry.registerFromModules(modules, 'discovered');
   * ```
   */
  async discoverFromEntries(
    entries: Array<{ name: string; module: FeatureModule }>,
  ): Promise<DiscoveryResult> {
    return this.registerFromModules(
      entries.map((e) => e.module),
      "discovered",
    );
  }

  /**
   * Retorna skills por tipo de origem.
   */
  listBySource(source: "discovered" | "manual"): SkillMeta[] {
    return Array.from(this.entries.values())
      .filter((e) => e.source === source)
      .map((e) => e.meta);
  }

  /**
   * Retorna o FeatureModule associado a uma skill.
   */
  getModule(name: string): FeatureModule | undefined {
    return this.entries.get(name)?.module;
  }

  /**
   * Ativa uma skill (chama o callback activate do FeatureModule).
   */
  async activateSkill(name: string): Promise<boolean> {
    const entry = this.entries.get(name);
    if (!entry?.module?.activate) return false;

    await entry.module.activate();
    return true;
  }

  /**
   * Desativa uma skill (chama o callback deactivate do FeatureModule).
   */
  async deactivateSkill(name: string): Promise<boolean> {
    const entry = this.entries.get(name);
    if (!entry?.module?.deactivate) return false;

    await entry.module.deactivate();
    return true;
  }

  /**
   * Retorna estatísticas do registry.
   */
  registryStats(): {
    total: number;
    discovered: number;
    manual: number;
  } {
    let discovered = 0;
    let manual = 0;

    for (const entry of this.entries.values()) {
      if (entry.source === "discovered") discovered++;
      else manual++;
    }

    return { total: this.entries.size, discovered, manual };
  }
}

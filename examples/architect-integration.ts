/**
 * Nexus + Architect — Real Integration Example
 *
 * Demonstra como os módulos do Nexus orquestram a análise
 * do projeto Architect em um fluxo completo e inteligente.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

import { IntentRouter, createIntentRouter } from "@nexus/bridge";
import { ReactionEngine } from "@nexus/bridge";
import { PersonaSystem, BUILT_IN_PERSONAS } from "@nexus/core";
import { SessionStateMachine, InMemoryStateStore } from "@nexus/core";
import { ModelRouter, inferTaskProfile } from "@nexus/core";
import type { RoutingResult, IntentContext } from "@nexus/bridge";
import type { SystemEvent, ActionExecutor } from "@nexus/bridge";

// ═══════════════════════════════════════════════════════════════
// 1. INTENT DETECTION — O que o usuário quer?
// ═══════════════════════════════════════════════════════════════

async function step1_detectIntent(userPrompt: string): Promise<RoutingResult> {
  const router = createIntentRouter();

  // Contexto do projeto architect
  const context: IntentContext = {
    hasCodebase: true,
    hasTests: true,
    hasPR: false,
    hasSecurityConcern: false,
    projectLanguages: ["typescript"],
    recentActivity: "active development",
  };

  const result = router.route(userPrompt, context);

  console.log("━━━ Step 1: Intent Detection ━━━");
  console.log(`  Prompt:     "${userPrompt}"`);
  console.log(`  Workflow:   ${result.workflow}`);
  console.log(`  Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  console.log(`  Complexity: ${result.complexity}`);
  console.log(`  Cynefin:    ${result.cynefin}`);
  console.log(`  Mode:       ${result.responseMode}`);
  console.log(`  Tier:       ${result.suggestedTier}`);
  console.log(`  Cost:       ${result.estimatedCostMultiplier}x`);
  console.log(`  Reasoning:  ${result.reasoning}`);
  console.log();

  return result;
}

// ═══════════════════════════════════════════════════════════════
// 2. SESSION STATE — Gerenciar fases da análise
// ═══════════════════════════════════════════════════════════════

async function step2_initSession(routing: RoutingResult) {
  const store = new InMemoryStateStore();
  const session = new SessionStateMachine("architect-analysis-001", store);

  // Inicia na fase de discovery
  console.log("━━━ Step 2: Session State Machine ━━━");
  console.log(`  Phase:    ${session.getSnapshot().phase}`);

  // Registra decisão de routing
  session.recordDecision({
    question: "Which workflow to use?",
    chosen: routing.workflow,
    alternatives: ["diamond-discover", "optimize-security", "quick-check"],
    reasoning: routing.reasoning,
    confidence: routing.confidence,
  });

  // Transiciona para análise
  session.transition("analyzing");
  console.log(`  → Moved to: ${session.getSnapshot().phase}`);

  // Registra observação do Architect
  session.recordObservation({
    source: "architect",
    content: "Project has 45 source files, TypeScript, Express-like patterns",
    tags: ["perception", "scan"],
  });

  console.log(`  Decisions: ${session.getSnapshot().decisions.length}`);
  console.log(`  Observations: ${session.getSnapshot().observations.length}`);
  console.log();

  return session;
}

// ═══════════════════════════════════════════════════════════════
// 3. PERSONA — Selecionar o agente certo
// ═══════════════════════════════════════════════════════════════

function step3_selectPersona(routing: RoutingResult) {
  const personas = new PersonaSystem();

  // Baseado no workflow detectado, escolhe persona
  const workflowToKeywords: Record<string, string[]> = {
    "optimize-security": ["security", "vulnerability"],
    "diamond-discover": ["architecture", "analysis"],
    "diamond-develop": ["implementation", "code"],
    "crossfire-debate": ["debate", "comparison"],
    "optimize-performance": ["performance", "optimization"],
  };

  const keywords = workflowToKeywords[routing.workflow] ?? ["architecture"];
  const match = personas.matchPersona(routing.workflow, keywords);

  console.log("━━━ Step 3: Persona Selection ━━━");
  if (match) {
    console.log(`  Persona:     ${match.persona.name}`);
    console.log(`  ID:          ${match.persona.id}`);
    console.log(`  Confidence:  ${(match.score * 100).toFixed(0)}%`);

    // Gera prompt enriquecido com contexto do persona
    const enrichedPrompt = personas.buildPrompt(
      match.persona,
      "Analyze the architect project's architecture quality and suggest improvements"
    );
    console.log(`  Prompt size: ${enrichedPrompt.length} chars (enriched with persona context)`);
  } else {
    console.log("  No persona matched — using default");
  }
  console.log();

  return match;
}

// ═══════════════════════════════════════════════════════════════
// 4. MODEL ROUTING — Escolher o modelo LLM certo
// ═══════════════════════════════════════════════════════════════

function step4_selectModel(routing: RoutingResult) {
  const modelRouter = new ModelRouter();

  // Infere o perfil da task baseado no routing
  const taskProfile = inferTaskProfile(
    `Analyze architecture of TypeScript project with ${routing.complexity} complexity`
  );

  const decision = modelRouter.route(taskProfile);

  console.log("━━━ Step 4: Model Selection ━━━");
  console.log(`  Task type:       ${taskProfile.type}`);
  console.log(`  Selected tier:   ${decision.tier}`);
  console.log(`  Reasoning:       ${decision.reasoning}`);
  console.log(`  Est. cost:       ${decision.estimatedCost}x`);
  console.log();

  return decision;
}

// ═══════════════════════════════════════════════════════════════
// 5. SIMULATED PIPELINE RUN + REACTION ENGINE
// ═══════════════════════════════════════════════════════════════

async function step5_runAndReact() {
  console.log("━━━ Step 5: Pipeline Run + Reaction Engine ━━━");

  // Simula resultado do Architect analyzer no projeto architect
  const architectResult = {
    projectName: "architect",
    score: { overall: 78, breakdown: { modularity: 82, coupling: 71, cohesion: 80, layering: 75 } },
    antiPatterns: [
      { name: "God Class", severity: "HIGH", location: "src/scanner.ts", description: "ProjectScanner has too many responsibilities (scan, config, filtering)" },
      { name: "Hub File", severity: "MEDIUM", location: "src/index.ts", description: "index.ts has 15+ connections — consider facade pattern" },
    ],
    layers: [
      { name: "Service", files: ["src/analyzer.ts", "src/scorer.ts", "src/anti-patterns.ts"] },
      { name: "Infrastructure", files: ["src/scanner.ts", "src/config.ts"] },
      { name: "API", files: ["src/index.ts"] },
      { name: "Data", files: ["src/types.ts"] },
    ],
    suggestions: [
      { priority: "HIGH", title: "Split ProjectScanner", description: "Extract file filtering into FileFilter class, config into ConfigManager" },
      { priority: "MEDIUM", title: "Facade for index.ts", description: "Create ArchitectFacade to reduce direct coupling to internals" },
    ],
  };

  console.log(`  Architect score:    ${architectResult.score.overall}/100`);
  console.log(`  Anti-patterns:      ${architectResult.antiPatterns.length}`);
  console.log(`  Layers detected:    ${architectResult.layers.length}`);
  console.log(`  Suggestions:        ${architectResult.suggestions.length}`);
  console.log();

  // Configura o ReactionEngine para reagir automaticamente
  const actions: string[] = [];
  const executor: ActionExecutor = {
    execute: async (action, event) => {
      actions.push(`${action}: ${event.type}`);
      return `Executed ${action} for ${event.type}`;
    },
  };

  const engine = new ReactionEngine(executor);

  // Simula eventos que o pipeline emitiria
  const events: SystemEvent[] = [
    {
      type: "pipeline.completed",
      source: "nexus",
      severity: "info",
      timestamp: new Date().toISOString(),
      data: { projectName: "architect", healthScore: 78, duration: 3200 },
    },
    {
      type: "architecture.score.low",
      source: "architect",
      severity: "warning",
      timestamp: new Date().toISOString(),
      data: { score: 71, metric: "coupling", threshold: 75 },
    },
  ];

  console.log("  Reaction Engine processing events:");
  for (const event of events) {
    const result = await engine.process(event);
    console.log(`    Event: ${event.type} (${event.severity}) → Actions: ${result.actionsExecuted}`);
  }

  const stats = engine.getStats();
  console.log(`\n  Reaction Stats:`);
  console.log(`    Events processed: ${stats.totalEventsProcessed}`);
  console.log(`    Actions executed: ${stats.totalActionsExecuted}`);
  console.log();
}

// ═══════════════════════════════════════════════════════════════
// MAIN — Roda o fluxo completo
// ═══════════════════════════════════════════════════════════════

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   Nexus + Architect — Integration Example       ║");
  console.log("║   Girardelli Tecnologia                         ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  // Diferentes prompts demonstram como o IntentRouter muda o fluxo
  const prompts = [
    "analyze the architecture quality of the architect project",
    "find security vulnerabilities in the architect codebase",
    "quick check — is the coupling score acceptable?",
    "comprehensive deep dive into the distributed event system design",
  ];

  // Roda o fluxo completo para o primeiro prompt
  const routing = await step1_detectIntent(prompts[0]);
  const session = await step2_initSession(routing);
  const persona = step3_selectPersona(routing);
  const model = step4_selectModel(routing);
  await step5_runAndReact();

  // Mostra como diferentes prompts mudam o routing
  console.log("━━━ Bonus: How different prompts change routing ━━━");
  const router = createIntentRouter();
  for (const prompt of prompts) {
    const r = router.route(prompt, { hasCodebase: true, hasTests: true, hasPR: false, hasSecurityConcern: false });
    console.log(`  "${prompt.substring(0, 50)}..."`);
    console.log(`    → ${r.workflow} | ${r.complexity} | ${r.responseMode} | ${(r.confidence * 100).toFixed(0)}%\n`);
  }

  // Completa a sessão
  session.transition("reviewing");
  session.transition("completed");
  console.log(`Session final phase: ${session.getSnapshot().phase}`);
  console.log(`Total decisions: ${session.getSnapshot().decisions.length}`);
}

main().catch(console.error);

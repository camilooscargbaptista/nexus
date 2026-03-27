/**
 * @nexus/bridge — Spec Parser
 *
 * Parseia input de alto nível (descrição de feature)
 * e extrai estrutura semântica: actors, features, data model hints,
 * tech stack, integration points.
 *
 * @author Camilo Girardelli — Girardelli Tecnologia
 */

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ParsedSpec {
  /** Título do projeto/feature */
  title: string;
  /** Descrição resumida */
  summary: string;
  /** Atores/personas identificados */
  actors: string[];
  /** Features/funcionalidades detectadas */
  features: ParsedFeature[];
  /** Entidades de dados detectadas */
  entities: string[];
  /** Stack tecnológica mencionada ou inferida */
  techStack: string[];
  /** Integrações externas */
  integrations: string[];
  /** Requisitos não-funcionais */
  nonFunctionalRequirements: string[];
  /** Confiança do parse (0-100) */
  confidence: number;
}

export interface ParsedFeature {
  /** Nome da feature */
  name: string;
  /** Descrição */
  description: string;
  /** Complexidade estimada (1-5) */
  complexity: number;
  /** Keywords associadas */
  keywords: string[];
}

// ═══════════════════════════════════════════════════════════════
// KEYWORD MAPS
// ═══════════════════════════════════════════════════════════════

const ACTOR_KEYWORDS: Record<string, string[]> = {
  user: ["user", "usuario", "usuário", "client", "cliente", "customer"],
  admin: ["admin", "administrator", "administrador", "manager", "gerente"],
  system: ["system", "sistema", "bot", "agent", "agente", "service", "serviço"],
  driver: ["driver", "motorista", "entregador"],
  operator: ["operator", "operador", "atendente"],
};

const TECH_KEYWORDS: Record<string, string[]> = {
  "TypeScript": ["typescript", "ts", "nestjs", "nest"],
  "Python": ["python", "fastapi", "django", "flask"],
  "React": ["react", "next.js", "nextjs", "frontend"],
  "Flutter": ["flutter", "dart", "mobile"],
  "PostgreSQL": ["postgres", "postgresql", "sql", "database", "banco"],
  "MongoDB": ["mongodb", "mongo", "nosql"],
  "Redis": ["redis", "cache"],
  "Kafka": ["kafka", "event", "mensageria", "messaging"],
  "Docker": ["docker", "container", "k8s", "kubernetes"],
  "AWS": ["aws", "lambda", "s3", "ec2", "ecs"],
};

const ENTITY_KEYWORDS: string[] = [
  "user", "usuario", "account", "conta", "order", "pedido", "payment", "pagamento",
  "product", "produto", "invoice", "fatura", "transaction", "transação", "debt", "dívida",
  "vehicle", "veículo", "station", "posto", "driver", "motorista", "fleet", "frota",
  "notification", "notificação", "message", "mensagem", "report", "relatório",
];

const NFR_KEYWORDS: Record<string, string[]> = {
  "High Availability": ["alta disponibilidade", "high availability", "99.9%", "uptime"],
  "Scalability": ["escalável", "scalable", "scale", "horizontal"],
  "Security": ["segurança", "security", "auth", "autenticação", "lgpd", "encryption"],
  "Performance": ["performance", "latência", "latency", "fast", "rápido"],
  "Observability": ["monitoring", "monitoramento", "logging", "tracing", "metrics"],
  "Multi-tenant": ["multi-tenant", "multi-empresa", "saas"],
};

// ═══════════════════════════════════════════════════════════════
// SPEC PARSER
// ═══════════════════════════════════════════════════════════════

/**
 * Parseia descrição de alto nível e extrai estrutura semântica.
 *
 * @example
 * ```ts
 * const parsed = SpecParser.parse(
 *   "Sistema de negociação de dívidas com WhatsApp, Telegram e SMS. " +
 *   "Agentes de onboarding, transação e compliance. Python + FastAPI + Kafka."
 * );
 *
 * parsed.actors    → ["system"]
 * parsed.techStack → ["Python", "Kafka"]
 * parsed.entities  → ["transaction", "debt"]
 * ```
 */
export class SpecParser {
  /**
   * Parseia input textual.
   */
  static parse(input: string): ParsedSpec {
    const lower = input.toLowerCase();
    const words = lower.split(/\s+/);

    // Title: first sentence or first 10 words
    const firstSentence = input.split(/[.!?]/)[0]?.trim() ?? "Untitled";
    const title = firstSentence.length > 80
      ? firstSentence.substring(0, 80) + "..."
      : firstSentence;

    // Actors
    const actors = this.detectActors(lower);

    // Tech stack
    const techStack = this.detectTechStack(lower);

    // Entities
    const entities = this.detectEntities(lower);

    // Features
    const features = this.extractFeatures(input);

    // Integrations
    const integrations = this.detectIntegrations(lower);

    // Non-functional requirements
    const nonFunctionalRequirements = this.detectNFRs(lower);

    // Confidence
    const signals = [
      actors.length > 0 ? 20 : 0,
      features.length > 0 ? 25 : 0,
      techStack.length > 0 ? 15 : 0,
      entities.length > 0 ? 15 : 0,
      words.length > 20 ? 15 : words.length > 10 ? 10 : 5,
      integrations.length > 0 ? 10 : 0,
    ];
    const confidence = Math.min(100, signals.reduce((a, b) => a + b, 0));

    return {
      title,
      summary: input.substring(0, 200),
      actors,
      features,
      entities,
      techStack,
      integrations,
      nonFunctionalRequirements,
      confidence,
    };
  }

  private static detectActors(text: string): string[] {
    const found = new Set<string>();
    for (const [actor, keywords] of Object.entries(ACTOR_KEYWORDS)) {
      if (keywords.some((kw) => text.includes(kw))) {
        found.add(actor);
      }
    }
    return [...found];
  }

  private static detectTechStack(text: string): string[] {
    const found = new Set<string>();
    for (const [tech, keywords] of Object.entries(TECH_KEYWORDS)) {
      if (keywords.some((kw) => text.includes(kw))) {
        found.add(tech);
      }
    }
    return [...found];
  }

  private static detectEntities(text: string): string[] {
    return ENTITY_KEYWORDS.filter((kw) => text.includes(kw));
  }

  private static detectIntegrations(text: string): string[] {
    const integrationKeywords: Record<string, string[]> = {
      "WhatsApp": ["whatsapp", "wpp"],
      "Telegram": ["telegram"],
      "SMS": ["sms"],
      "Email": ["email", "e-mail"],
      "Slack": ["slack"],
      "GitHub": ["github"],
      "Jira": ["jira"],
      "Stripe": ["stripe", "payment gateway"],
      "S3": ["s3", "storage"],
    };

    const found: string[] = [];
    for (const [name, keywords] of Object.entries(integrationKeywords)) {
      if (keywords.some((kw) => text.includes(kw))) {
        found.push(name);
      }
    }
    return found;
  }

  private static detectNFRs(text: string): string[] {
    const found: string[] = [];
    for (const [name, keywords] of Object.entries(NFR_KEYWORDS)) {
      if (keywords.some((kw) => text.includes(kw))) {
        found.push(name);
      }
    }
    return found;
  }

  private static extractFeatures(text: string): ParsedFeature[] {
    const features: ParsedFeature[] = [];

    // Pattern: detect feature-like phrases
    const featurePatterns = [
      /(?:sistema de|module for|módulo de|feature de|funcionalidade de)\s+([^,.!?]+)/gi,
      /(?:agente[s]? de|agent[s]? for)\s+([^,.!?]+)/gi,
      /(?:crud|gestão de|management of|gerenciamento de)\s+([^,.!?]+)/gi,
      /(?:dashboard|painel|relatório|report)\s+(?:de\s+)?([^,.!?]+)/gi,
      /(?:api|endpoint|rota)\s+(?:de\s+|for\s+)?([^,.!?]+)/gi,
    ];

    for (const pattern of featurePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]!.trim();
        if (name.length > 2 && name.length < 50) {
          features.push({
            name,
            description: `Feature: ${name}`,
            complexity: Math.min(5, Math.ceil(name.split(/\s+/).length / 2)),
            keywords: name.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
          });
        }
      }
    }

    return features;
  }
}

/**
 * Manual mock for @prisma/client
 *
 * Provides a fully-typed PrismaClient mock with all model delegates
 * and system methods. Tests import getMockInstance() to set up mocks.
 */

/** Shared mock instance — reset via jest.clearAllMocks() in beforeEach */
const mockInstance = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  team: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  teamMember: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  project: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  pipelineRun: {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
  $queryRaw: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

type MockInstance = typeof mockInstance;

/**
 * PrismaClient mock class — returns the shared singleton on construction.
 * All model delegates and system methods are declared as class members
 * so TypeScript can see them.
 */
export class PrismaClient {
  user!: MockInstance["user"];
  team!: MockInstance["team"];
  teamMember!: MockInstance["teamMember"];
  project!: MockInstance["project"];
  pipelineRun!: MockInstance["pipelineRun"];
  auditLog!: MockInstance["auditLog"];
  $queryRaw!: MockInstance["$queryRaw"];
  $connect!: MockInstance["$connect"];
  $disconnect!: MockInstance["$disconnect"];

  constructor(_options?: any) {
    // Return the shared mock instance so all repos share the same fns
    return mockInstance as any;
  }
}

/** Test helper — access the shared mock instance for assertions */
export function getMockInstance(): MockInstance {
  return mockInstance;
}

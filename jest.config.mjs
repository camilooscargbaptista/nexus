/** @type {import('jest').Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  setupFiles: ["./jest.setup.cjs"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^@camilooscargbaptista/nexus-types$": "<rootDir>/packages/types/src/index.ts",
    "^@camilooscargbaptista/nexus-events$": "<rootDir>/packages/events/src/index.ts",
    "^@camilooscargbaptista/nexus-core$": "<rootDir>/packages/core/src/index.ts",
    "^@camilooscargbaptista/nexus-bridge$": "<rootDir>/packages/bridge/src/index.ts",
    "^@camilooscargbaptista/nexus-autonomy$": "<rootDir>/packages/autonomy/src/index.ts",
    "^@prisma/client$": "<rootDir>/packages/cloud/src/__mocks__/@prisma/client.ts",
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "ESNext",
          moduleResolution: "bundler",
          target: "ES2022",
          strict: true,
          esModuleInterop: true,
          declaration: false,
          types: ["node", "jest"],
          paths: {
            "@camilooscargbaptista/nexus-types": ["./packages/types/src"],
            "@camilooscargbaptista/nexus-events": ["./packages/events/src"],
            "@camilooscargbaptista/nexus-core": ["./packages/core/src"],
            "@camilooscargbaptista/nexus-bridge": ["./packages/bridge/src"],
            "@camilooscargbaptista/nexus-autonomy": ["./packages/autonomy/src"],
            "@prisma/client": ["./packages/cloud/src/__mocks__/@prisma/client.ts"],
          },
        },
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: ["packages/*/src/**/*.ts", "!**/__tests__/**"],
};

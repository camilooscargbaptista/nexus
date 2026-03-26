/** @type {import('jest').Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  setupFiles: ["./jest.setup.cjs"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^@nexus/types$": "<rootDir>/packages/types/src/index.ts",
    "^@nexus/events$": "<rootDir>/packages/events/src/index.ts",
    "^@nexus/core$": "<rootDir>/packages/core/src/index.ts",
    "^@nexus/bridge$": "<rootDir>/packages/bridge/src/index.ts",
    "^@nexus/autonomy$": "<rootDir>/packages/autonomy/src/index.ts",
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
            "@nexus/types": ["./packages/types/src"],
            "@nexus/events": ["./packages/events/src"],
            "@nexus/core": ["./packages/core/src"],
            "@nexus/bridge": ["./packages/bridge/src"],
            "@nexus/autonomy": ["./packages/autonomy/src"],
          },
        },
      },
    ],
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  collectCoverageFrom: ["packages/*/src/**/*.ts", "!**/__tests__/**"],
};

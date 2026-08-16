/**
 * The source is ESM TypeScript compiled by esbuild for Lambda. For tests, ts-jest transpiles it to CommonJS
 * instead, which keeps Jest working without experimental VM modules.
 *
 * The moduleNameMapper strips the `.js` suffix that NodeNext requires on relative imports in the source, since
 * the files on disk are `.ts`.
 */
export default {
  testEnvironment: "node",
  roots: ["<rootDir>/tests"],
  testMatch: ["**/*.test.ts"],
  setupFiles: ["<rootDir>/tests/jest.setup.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: {
          module: "commonjs",
          moduleResolution: "node",
          target: "ES2022",
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          types: ["node", "jest"],
        },
      },
    ],
  },
  clearMocks: true,
};

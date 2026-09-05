module.exports = {
  rootDir: '../..',
  modulePathIgnorePatterns: ['<rootDir>/.worktrees/'],
  // B1 and B2 keep their specs in apps/api/test, B3 next to the engine it covers.
  testMatch: ['<rootDir>/apps/api/test/**/*.spec.ts', '<rootDir>/apps/api/src/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/apps/api/tsconfig.spec.json' }],
  },
  moduleNameMapper: { '^@dealflow/contracts$': '<rootDir>/packages/contracts/src/index.ts' },
};

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '../..',
  testMatch: ['<rootDir>/apps/api/src/**/*.spec.ts'],
  moduleNameMapper: { '^@dealflow/contracts$': '<rootDir>/packages/contracts/src/index.ts' },
};

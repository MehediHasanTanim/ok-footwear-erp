import type { Config } from 'jest';

/**
 * Jest configuration for OK Footwear ERP.
 *
 * Key decisions:
 * - ts-jest for TypeScript compilation in tests.
 * - moduleNameMapper maps tsconfig path aliases so tests resolve @/ imports.
 * - Coverage thresholds: 80% branches, 75% functions, 80% lines, 80% statements.
 *   These are the Sprint 1 baseline; they will be raised progressively.
 * - testPathIgnorePatterns excludes e2e tests from unit test runs.
 * - roots: tests live alongside source in __tests__/ folders per module.
 */
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 75,
      lines: 80,
      statements: 80,
    },
  },
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@modules/(.*)$': '<rootDir>/src/modules/$1',
    '^@common/(.*)$': '<rootDir>/src/common/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@config/(.*)$': '<rootDir>/src/shared/config/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@test/(.*)$': '<rootDir>/test/$1',
  },
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/e2e/'],
  setupFilesAfterSetup: [],
};

export default config;

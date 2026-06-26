import type { Config } from 'jest';

/**
 * Jest multi-project configuration for OK Footwear ERP.
 *
 * Two separate projects run in isolation:
 *
 *   unit          — Fast, no I/O. Runs on every file change.
 *   integration   — Spins up real PostgreSQL + Redis via testcontainers.
 *                   Transaction rollback after each test keeps DB clean.
 *
 * Coverage thresholds (enforced globally across both projects):
 *   statements: 80%  |  branches: 75%  |  functions: 80%
 *
 * Commands:
 *   npm test                          # Run both projects
 *   npm test -- --selectProjects unit # Unit only
 *   npx jest --selectProjects integration  # Integration only
 */

const config: Config = {
  // Global settings — applied to both projects unless overridden
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',

  // Coverage is collected across both projects and merged
  collectCoverageFrom: [
    'src/**/*.(t|j)s',
    '!src/**/*.module.ts',
    '!src/main.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: './coverage',
  coverageThreshold: {
    global: {
      statements: 80,
      branches: 75,
      functions: 80,
    },
  },

  // -----------------------------------------------------------------------
  // Projects — each has its own test environment and setup
  // -----------------------------------------------------------------------

  projects: [
    // =====================================================================
    // Unit Tests — No containers, no I/O, fast feedback
    // =====================================================================
    {
      displayName: 'unit',
      testEnvironment: 'node',
      transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
      },
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      // Exclude integration tests — they go to the integration project
      testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/integration/',
      ],
      roots: ['<rootDir>/src'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@modules/(.*)$': '<rootDir>/src/modules/$1',
        '^@common/(.*)$': '<rootDir>/src/common/$1',
        '^@shared/(.*)$': '<rootDir>/src/shared/$1',
        '^@config/(.*)$': '<rootDir>/src/shared/config/$1',
        '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
        '^@test/(.*)$': '<rootDir>/test/$1',
      },
    },

    // =====================================================================
    // Integration Tests — Real PG + Redis via testcontainers
    // =====================================================================
    {
      displayName: 'integration',
      testEnvironment: 'node',
      transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
      },
      // Integration tests live in src/**/integration/ folders
      testMatch: ['<rootDir>/src/**/integration/**/*.spec.ts'],
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

      // Testcontainers lifecycle — start containers before ALL tests,
      // stop after ALL tests (not per-suite — that would be too slow)
      globalSetup: '<rootDir>/test/helpers/integration-global-setup.js',
      globalTeardown: '<rootDir>/test/helpers/integration-global-teardown.js',

      // Per-test transaction rollback — runs before/after each individual test
      setupFilesAfterEnv: [
        '<rootDir>/test/helpers/integration-test-setup.ts',
      ],

      // Longer timeout — container startup takes 30-60s
    },
  ],
};

export default config;

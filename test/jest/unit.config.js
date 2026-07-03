const base = require('./base.config');

module.exports = {
  ...base,
  displayName: 'unit',
  testPathIgnorePatterns: [
    '<rootDir>/apps/api/src/api.module.spec.ts',
    '<rootDir>/apps/api/src/health/health.controller.spec.ts',
  ],
  testMatch: ['<rootDir>/{apps,libs}/**/*.spec.ts', '<rootDir>/test/*.spec.ts'],
};

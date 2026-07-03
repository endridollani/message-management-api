const base = require('./base.config');

module.exports = {
  ...base,
  displayName: 'e2e',
  testMatch: [
    '<rootDir>/test/e2e/**/*.spec.ts',
    '<rootDir>/apps/api/src/api.module.spec.ts',
    '<rootDir>/apps/api/src/health/health.controller.spec.ts',
  ],
};

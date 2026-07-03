const base = require('./base.config');

module.exports = {
  ...base,
  displayName: 'integration',
  maxWorkers: 1,
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  testTimeout: 180000,
};

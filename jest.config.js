const unitConfig = require('./test/jest/unit.config');
const e2eConfig = require('./test/jest/e2e.config');

module.exports = {
  projects: [unitConfig, e2eConfig],
};

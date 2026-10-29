/** Update technicals and fundamentals independently, including interrupted imports. */
const { runTechnicalWorker } = require('./daily-technical');
const { runFundamentalWorker } = require('./fundamental');
const { sequelize } = require('../models');
const { workerOptions } = require('../utils/worker-selection');
const logger = require('../utils/logger');

async function runAll({ technical = runTechnicalWorker, fundamental = runFundamentalWorker } = {}) {
  workerOptions(); // Reject conflicting flags before starting either worker.
  logger.info('STARTING FULL DATABASE UPDATE');
  const errors = [];
  for (const [name, run] of [['Technical', technical], ['Fundamental', fundamental]]) {
    try {
      await run();
      logger.info(`${name} update complete.`);
    } catch (error) {
      errors.push(error);
      logger.error(`${name} update incomplete; continuing other data sources.`, { error: error.message });
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Update incomplete. Saved data is retained; run update:all -- --resume to retry missing updates.');
  logger.info('FULL DATABASE UPDATE COMPLETE');
}

if (require.main === module) {
  runAll().catch(error => {
    logger.error(error.message);
    process.exitCode = 1;
  }).finally(() => sequelize.close());
}

module.exports = { runAll };

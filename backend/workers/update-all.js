/**
 * Run All Workers Sequentially
 * Fetches Technical Data first, then Fundamental Data.
 */

const { runTechnicalWorker } = require('./daily-technical');
const { runFundamentalWorker } = require('./fundamental');
const logger = require('../utils/logger');

async function runAll() {
  logger.info('======================================');
  logger.info('🚀 STARTING FULL DATABASE UPDATE 🚀');
  logger.info('======================================');

  try {
    // Run technicals first
    await runTechnicalWorker();
    
    logger.info('✅ Technical update complete. Starting fundamentals...');
    
    // Run fundamentals next
    await runFundamentalWorker();

    logger.info('======================================');
    logger.info('🎉 FULL DATABASE UPDATE COMPLETE 🎉');
    logger.info('======================================');
    process.exit(0);
  } catch (err) {
    logger.error('Failed full update', { error: err.message });
    process.exit(1);
  }
}

runAll();

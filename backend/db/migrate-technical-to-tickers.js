/**
 * Migration: Add Technical Indicator Columns to Tickers
 * 
 * This script:
 * 1. Adds new columns to the Tickers table (IF NOT EXISTS)
 * 2. Backfills data from the latest Daily_Metrics row per symbol
 * 3. Safe to re-run multiple times (idempotent)
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sequelize } = require('../models');
const logger = require('../utils/logger');

async function runMigration() {
  const startTime = Date.now();
  logger.info('=== Migration: Technical Indicators → Tickers START ===');

  try {
    await sequelize.authenticate();
    logger.info('Database connected.');

    // Step 1: Add new columns to Tickers (IF NOT EXISTS)
    const newColumns = [
      { name: 'macd_signal',    type: 'DECIMAL(10, 4)' },
      { name: 'macd_histogram', type: 'DECIMAL(10, 4)' },
      { name: 'bb_upper',       type: 'DECIMAL(10, 2)' },
      { name: 'bb_middle',      type: 'DECIMAL(10, 2)' },
      { name: 'bb_lower',       type: 'DECIMAL(10, 2)' },
      { name: 'atr_14',         type: 'DECIMAL(10, 2)' },
      { name: 'rsi_7',          type: 'DECIMAL(5, 2)' },
      { name: 'volume',         type: 'BIGINT' },
    ];

    for (const col of newColumns) {
      try {
        await sequelize.query(`ALTER TABLE tickers ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}`);
        logger.info(`  ✅ Column "${col.name}" ready.`);
      } catch (err) {
        // Some DBs don't support IF NOT EXISTS, handle gracefully
        if (err.message.includes('already exists')) {
          logger.info(`  ⏭️ Column "${col.name}" already exists, skipping.`);
        } else {
          throw err;
        }
      }
    }

    // Step 2: Add new indexes
    const indexes = [
      { name: 'idx_tickers_rsi_14', column: 'rsi_14' },
      { name: 'idx_tickers_current_price', column: 'current_price' },
    ];

    for (const idx of indexes) {
      try {
        await sequelize.query(`CREATE INDEX IF NOT EXISTS ${idx.name} ON tickers(${idx.column})`);
        logger.info(`  ✅ Index "${idx.name}" ready.`);
      } catch (err) {
        if (err.message.includes('already exists')) {
          logger.info(`  ⏭️ Index "${idx.name}" already exists, skipping.`);
        } else {
          throw err;
        }
      }
    }

    // Step 3: Backfill from Daily_Metrics (latest row per symbol)
    logger.info('Backfilling technical data from Daily_Metrics...');

    const result = await sequelize.query(`
      UPDATE tickers t
      SET
        macd_signal    = dm.macd_signal,
        macd_histogram = dm.macd_histogram,
        bb_upper       = dm.bb_upper,
        bb_middle      = dm.bb_middle,
        bb_lower       = dm.bb_lower,
        atr_14         = dm.atr_14,
        rsi_7          = dm.rsi_7,
        volume         = dm.volume
      FROM (
        SELECT DISTINCT ON (symbol)
          symbol, macd_signal, macd_histogram,
          bb_upper, bb_middle, bb_lower,
          atr_14, rsi_7, volume
        FROM daily_metrics
        ORDER BY symbol, date DESC
      ) dm
      WHERE t.symbol = dm.symbol
    `);

    const rowCount = result[1]?.rowCount ?? result[1] ?? 'unknown';
    logger.info(`  ✅ Backfilled ${rowCount} tickers with latest Daily_Metrics data.`);

    logger.info(`=== Migration COMPLETE in ${((Date.now() - startTime) / 1000).toFixed(1)}s ===`);
    logger.info('');
    logger.info('ℹ️  Daily_Metrics table is now SOFT DEPRECATED.');
    logger.info('   The worker will no longer INSERT into it.');
    logger.info('   You can DROP it later when you are confident the new system works.');

  } catch (err) {
    logger.error('Migration failed!', { error: err.message, stack: err.stack });
    process.exit(1);
  }

  process.exit(0);
}

runMigration();

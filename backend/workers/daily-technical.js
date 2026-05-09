/**
 * Daily Technical Worker
 * Fetches OHLCV data from Polygon.io and calculates technical indicators.
 * Schedule: 5:00 PM EST (21:00 UTC) on weekdays.
 *
 * Usage:
 *   node workers/daily-technical.js          # Run once
 *   node workers/daily-technical.js --cron   # Run on schedule
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const { query, transaction } = require('../db/pool');
const { createApiClients, sleep } = require('../utils/api-clients');
const { calculateAll } = require('../utils/indicators');
const logger = require('../utils/logger');

const BATCH_SIZE = parseInt(process.env.WORKER_BATCH_SIZE, 10) || 100;
const RETRY_ATTEMPTS = parseInt(process.env.WORKER_RETRY_ATTEMPTS, 10) || 3;

async function runTechnicalWorker() {
  const startTime = Date.now();
  logger.info('=== Daily Technical Worker START ===');

  const { polygon } = createApiClients();

  try {
    // 1. Get today's date (or most recent trading day)
    const today = getMarketDate();
    logger.info(`Processing date: ${today}`);

    // 2. Fetch grouped daily bars (all stocks in one call!)
    logger.info('Fetching grouped daily bars from Polygon...');
    const bars = await polygon.getGroupedDaily(today);
    logger.info(`Received ${bars.length} ticker bars`);

    if (bars.length === 0) {
      logger.warn('No bars returned — market may be closed');
      return;
    }

    // 3. Get all known tickers from our DB
    const tickerResult = await query('SELECT symbol FROM Tickers');
    const knownSymbols = new Set(tickerResult.rows.map(r => r.symbol));

    // Filter to only stocks we track
    const relevantBars = bars.filter(b => knownSymbols.has(b.T));
    logger.info(`${relevantBars.length} bars match tracked tickers`);

    // 4. Process in batches
    let processed = 0;
    let errors = 0;

    for (let i = 0; i < relevantBars.length; i += BATCH_SIZE) {
      const batch = relevantBars.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(batch.map(async (bar) => {
        try {
          await processTickerTechnicals(polygon, bar.T, today, bar);
          processed++;
        } catch (err) {
          errors++;
          logger.error(`Failed to process ${bar.T}`, { error: err.message });
        }
      }));

      // Progress log
      if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= relevantBars.length) {
        logger.info(`Progress: ${Math.min(i + BATCH_SIZE, relevantBars.length)}/${relevantBars.length} (${errors} errors)`);
      }

      await sleep(100); // Brief pause between batches
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`=== Daily Technical Worker DONE === ${processed} processed, ${errors} errors in ${duration}s`);
  } catch (err) {
    logger.error('Technical worker fatal error', { error: err.message, stack: err.stack });
  }
}

/**
 * Process a single ticker: fetch historical data, calculate indicators, insert.
 */
async function processTickerTechnicals(polygon, symbol, date, todayBar) {
  // We need ~200 days of historical data for SMA(200)
  // Fetch from DB first, supplement from API if needed
  const histResult = await query(
    `SELECT date, open, high, low, close, volume
     FROM Daily_Metrics
     WHERE symbol = $1
     ORDER BY date ASC
     LIMIT 250`,
    [symbol]
  );

  // Build OHLCV array for indicator calculation
  const historicalBars = histResult.rows.map(r => ({
    o: parseFloat(r.open),
    h: parseFloat(r.high),
    l: parseFloat(r.low),
    c: parseFloat(r.close),
    v: parseInt(r.volume, 10),
  }));

  // Add today's bar
  historicalBars.push({
    o: todayBar.o,
    h: todayBar.h,
    l: todayBar.l,
    c: todayBar.c,
    v: todayBar.v,
  });

  // Calculate all indicators
  const indicators = calculateAll(historicalBars);

  // Upsert into Daily_Metrics
  await query(
    `INSERT INTO Daily_Metrics (symbol, date, open, high, low, close, volume,
      rsi_14, rsi_7, macd, macd_signal, macd_histogram,
      sma_20, sma_50, sma_200, bb_upper, bb_middle, bb_lower, atr_14)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
     ON CONFLICT (symbol, date) DO UPDATE SET
       open = EXCLUDED.open, high = EXCLUDED.high, low = EXCLUDED.low,
       close = EXCLUDED.close, volume = EXCLUDED.volume,
       rsi_14 = EXCLUDED.rsi_14, rsi_7 = EXCLUDED.rsi_7,
       macd = EXCLUDED.macd, macd_signal = EXCLUDED.macd_signal,
       macd_histogram = EXCLUDED.macd_histogram,
       sma_20 = EXCLUDED.sma_20, sma_50 = EXCLUDED.sma_50,
       sma_200 = EXCLUDED.sma_200,
       bb_upper = EXCLUDED.bb_upper, bb_middle = EXCLUDED.bb_middle,
       bb_lower = EXCLUDED.bb_lower, atr_14 = EXCLUDED.atr_14`,
    [
      symbol, date,
      todayBar.o, todayBar.h, todayBar.l, todayBar.c, todayBar.v,
      indicators.rsi_14, indicators.rsi_7,
      indicators.macd, indicators.macd_signal, indicators.macd_histogram,
      indicators.sma_20, indicators.sma_50, indicators.sma_200,
      indicators.bb_upper, indicators.bb_middle, indicators.bb_lower,
      indicators.atr_14,
    ]
  );

  // Update cached price in Tickers
  const prevClose = historicalBars.length >= 2
    ? historicalBars[historicalBars.length - 2].c
    : todayBar.c;
  const changePct = prevClose !== 0
    ? parseFloat(((todayBar.c - prevClose) / prevClose * 100).toFixed(2))
    : 0;

  await query(
    `UPDATE Tickers SET current_price = $1, price_change_pct = $2, last_technical_update = NOW() WHERE symbol = $3`,
    [todayBar.c, changePct, symbol]
  );
}

/**
 * Get the most recent market date (skip weekends).
 */
function getMarketDate() {
  const now = new Date();
  const day = now.getDay();
  // If Sunday (0) go back 2 days, Saturday (6) go back 1 day
  if (day === 0) now.setDate(now.getDate() - 2);
  if (day === 6) now.setDate(now.getDate() - 1);
  return now.toISOString().split('T')[0];
}

// ============================================
// Entry Point
// ============================================
if (process.argv.includes('--cron')) {
  const schedule = process.env.TECHNICAL_WORKER_CRON || '0 17 * * 1-5';
  logger.info(`Technical worker scheduled: ${schedule}`);
  cron.schedule(schedule, runTechnicalWorker, { timezone: 'America/New_York' });
} else {
  runTechnicalWorker().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { runTechnicalWorker };

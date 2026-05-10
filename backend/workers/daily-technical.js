/**
 * Daily Technical Worker — Yahoo Finance Version
 * 100% Free. No API Keys needed.
 * Scrapes historical data, calculates indicators locally, and saves to DB.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance();
const { Ticker, DailyMetric } = require('../models');
const { calculateAll } = require('../utils/indicators');
const logger = require('../utils/logger');

// Sleep utility to avoid Yahoo IP bans
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to split array into chunks (batches)
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

async function runTechnicalWorker() {
  const startTime = Date.now();
  logger.info('=== Yahoo Technical Worker START ===');

  try {
    // 1. Checkpointing: Get only symbols that haven't been updated in the last 12 hours
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

    const { Op } = require('sequelize');
    const isForce = process.argv.includes('--force');

    const queryOptions = { attributes: ['symbol'], raw: true };
    if (!isForce) {
      queryOptions.where = {
        [Op.or]: [
          { last_technical_update: { [Op.lt]: twelveHoursAgo } },
          { last_technical_update: null }
        ]
      };
      logger.info('Checkpointing active: Only fetching stocks needing update (older than 12h).');
    } else {
      logger.info('FORCE mode: Fetching all stocks regardless of last update.');
    }

    const tickers = await Ticker.findAll(queryOptions);
    logger.info(`Loaded ${tickers.length} tickers to process.`);

    // Date range for historical data (e.g. last 300 days)
    const period1 = new Date();
    period1.setDate(period1.getDate() - 300);
    const yahooOptions = { period1: period1.toISOString().split('T')[0] };

    // 2. Smart Batching: Process 10 at a time
    const batches = chunkArray(tickers, 10);
    let processed = 0, errors = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      const fetchPromises = batch.map(async (t) => {
        const symbol = t.symbol;
        try {
          const result = await yf.chart(symbol, yahooOptions);

          if (!result || !result.quotes || result.quotes.length === 0) {
            throw new Error('No historical data found');
          }

          // Convert Yahoo data to our OHLCV format
          const ohlcvBars = result.quotes.map(r => ({
            o: r.open, h: r.high, l: r.low, c: r.close, v: r.volume
          }));

          // Calculate all technical indicators perfectly using local math
          const ind = calculateAll(ohlcvBars);

          // Get today's bar
          const todayBar = ohlcvBars[ohlcvBars.length - 1];
          const dateStr = result.quotes[result.quotes.length - 1].date.toISOString().split('T')[0];

          // Upsert into DailyMetric
          await DailyMetric.upsert({
            symbol,
            date: dateStr,
            open: todayBar.o, high: todayBar.h, low: todayBar.l, close: todayBar.c, volume: todayBar.v,
            rsi_14: ind.rsi_14, rsi_14_ma: ind.rsi_14_ma, rsi_14_bb_upper: ind.rsi_14_bb_upper, rsi_14_bb_lower: ind.rsi_14_bb_lower, rsi_7: ind.rsi_7,
            macd: ind.macd, macd_signal: ind.macd_signal, macd_histogram: ind.macd_histogram,
            bb_upper: ind.bb_upper, bb_middle: ind.bb_middle, bb_lower: ind.bb_lower,
            atr_14: ind.atr_14,
          });

          // Update ticker price
          const prevClose = ohlcvBars.length >= 2 ? ohlcvBars[ohlcvBars.length - 2].c : todayBar.c;
          const changePct = prevClose !== 0 ? ((todayBar.c - prevClose) / prevClose * 100).toFixed(2) : 0;

          await Ticker.update(
            { 
              current_price: todayBar.c, 
              price_change_pct: changePct, 
              rsi_14: ind.rsi_14,
              macd: ind.macd,
              last_technical_update: new Date() 
            },
            { where: { symbol } }
          );

          processed++;
          logger.debug(`✅ Processed ${symbol}`);
        } catch (err) {
          errors++;
          logger.warn(`⚠️ Failed ${symbol}: ${err.message}`);
        }
      });

      await Promise.all(fetchPromises);
      logger.info(`Completed batch ${i + 1}/${batches.length} (${processed} ok, ${errors} err)`);

      // 🛑 SLEEP: 1 second between batches
      await sleep(1000);
    }

    logger.info(`=== Yahoo Worker DONE === ${processed} ok, ${errors} errors in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  } catch (err) {
    logger.error('Technical worker fatal error', { error: err.message, stack: err.stack });
  }
}

if (require.main === module) {
  if (process.argv.includes('--cron')) {
    const schedule = process.env.TECHNICAL_WORKER_CRON || '0 17 * * 1-5';
    logger.info(`Yahoo Technical worker scheduled: ${schedule}`);
    cron.schedule(schedule, runTechnicalWorker, { timezone: 'America/New_York' });
  } else {
    runTechnicalWorker().then(() => process.exit(0)).catch(() => process.exit(1));
  }
}

module.exports = { runTechnicalWorker };

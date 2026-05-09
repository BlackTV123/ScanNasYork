/**
 * Daily Technical Worker — Sequelize ORM Version
 * Schedule: 5:00 PM EST on weekdays.
 *
 * Usage:
 *   node workers/daily-technical.js          # Run once
 *   node workers/daily-technical.js --cron   # Run on schedule
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const { Ticker, DailyMetric } = require('../models');
const { createApiClients, sleep } = require('../utils/api-clients');
const { calculateAll } = require('../utils/indicators');
const logger = require('../utils/logger');

const BATCH_SIZE = parseInt(process.env.WORKER_BATCH_SIZE, 10) || 100;

async function runTechnicalWorker() {
  const startTime = Date.now();
  logger.info('=== Daily Technical Worker START ===');

  const { polygon, alphaVantage } = createApiClients();

  try {
    const today = getMarketDate();
    logger.info(`Processing date: ${today}`);

    // 1. Fetch grouped daily bars
    const bars = await polygon.getGroupedDaily(today);
    logger.info(`Received ${bars.length} ticker bars`);

    if (bars.length === 0) {
      logger.warn('No bars returned — market may be closed');
      return;
    }

    // 2. Get tracked symbols
    const tickers = await Ticker.findAll({ attributes: ['symbol'], raw: true });
    const knownSymbols = new Set(tickers.map(r => r.symbol));
    const relevantBars = bars.filter(b => knownSymbols.has(b.T));
    logger.info(`${relevantBars.length} bars match tracked tickers`);

    // 3. Process in batches
    let processed = 0, errors = 0;

    for (let i = 0; i < relevantBars.length; i += BATCH_SIZE) {
      const batch = relevantBars.slice(i, i + BATCH_SIZE);

      await Promise.allSettled(batch.map(async (bar) => {
        try {
          await processTickerTechnicals(alphaVantage, bar.T, today, bar);
          processed++;
        } catch (err) {
          errors++;
          logger.error(`Failed ${bar.T}`, { error: err.message });
        }
      }));

      if ((i + BATCH_SIZE) % 500 === 0) {
        logger.info(`Progress: ${Math.min(i + BATCH_SIZE, relevantBars.length)}/${relevantBars.length}`);
      }
      await sleep(100);
    }

    logger.info(`=== Technical Worker DONE === ${processed} ok, ${errors} errors in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  } catch (err) {
    logger.error('Technical worker fatal error', { error: err.message, stack: err.stack });
  }
}

async function processTickerTechnicals(alphaVantage, symbol, date, todayBar) {
  // Fetch historical bars from DB
  const historical = await DailyMetric.findAll({
    where: { symbol },
    order: [['date', 'ASC']],
    limit: 250,
    raw: true,
  });

  const ohlcvBars = historical.map(r => ({
    o: parseFloat(r.open), h: parseFloat(r.high),
    l: parseFloat(r.low), c: parseFloat(r.close), v: parseInt(r.volume, 10),
  }));
  ohlcvBars.push({ o: todayBar.o, h: todayBar.h, l: todayBar.l, c: todayBar.c, v: todayBar.v });

  const ind = calculateAll(ohlcvBars);

  // --- ALPHA VANTAGE INTEGRATION ---
  try {
    if (process.env.ALPHA_VANTAGE_API_KEY && !process.env.ALPHA_VANTAGE_API_KEY.includes('your_')) {
      logger.debug(`Fetching RSI & MACD from Alpha Vantage for ${symbol}...`);
      
      const rsiData = await alphaVantage.getRSI(symbol);
      const latestRsiDate = Object.keys(rsiData)[0];
      if (latestRsiDate && rsiData[latestRsiDate]['RSI']) {
        ind.rsi_14 = parseFloat(rsiData[latestRsiDate]['RSI']);
      }

      const macdData = await alphaVantage.getMACD(symbol);
      const latestMacdDate = Object.keys(macdData)[0];
      if (latestMacdDate && macdData[latestMacdDate]['MACD']) {
        ind.macd = parseFloat(macdData[latestMacdDate]['MACD']);
        ind.macd_signal = parseFloat(macdData[latestMacdDate]['MACD_Signal']);
        ind.macd_histogram = parseFloat(macdData[latestMacdDate]['MACD_Hist']);
      }
    }
  } catch (err) {
    logger.warn(`Alpha Vantage API failed for ${symbol}, falling back to local calculation. Error: ${err.message}`);
  }
  // ---------------------------------

  // Upsert daily metric
  await DailyMetric.upsert({
    symbol, date,
    open: todayBar.o, high: todayBar.h, low: todayBar.l, close: todayBar.c, volume: todayBar.v,
    rsi_14: ind.rsi_14, rsi_7: ind.rsi_7,
    macd: ind.macd, macd_signal: ind.macd_signal, macd_histogram: ind.macd_histogram,
    sma_20: ind.sma_20, sma_50: ind.sma_50, sma_200: ind.sma_200,
    bb_upper: ind.bb_upper, bb_middle: ind.bb_middle, bb_lower: ind.bb_lower,
    atr_14: ind.atr_14,
  });

  // Update ticker price
  const prevClose = ohlcvBars.length >= 2 ? ohlcvBars[ohlcvBars.length - 2].c : todayBar.c;
  const changePct = prevClose !== 0 ? ((todayBar.c - prevClose) / prevClose * 100).toFixed(2) : 0;

  await Ticker.update(
    { current_price: todayBar.c, price_change_pct: changePct, last_technical_update: new Date() },
    { where: { symbol } }
  );
}

function getMarketDate() {
  const now = new Date();
  if (now.getDay() === 0) now.setDate(now.getDate() - 2);
  if (now.getDay() === 6) now.setDate(now.getDate() - 1);
  return now.toISOString().split('T')[0];
}

if (process.argv.includes('--cron')) {
  const schedule = process.env.TECHNICAL_WORKER_CRON || '0 17 * * 1-5';
  logger.info(`Technical worker scheduled: ${schedule}`);
  cron.schedule(schedule, runTechnicalWorker, { timezone: 'America/New_York' });
} else {
  runTechnicalWorker().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { runTechnicalWorker };

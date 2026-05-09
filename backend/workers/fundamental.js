/**
 * Fundamental Worker — Yahoo Finance Version
 * 100% Free. No API Keys needed.
 * Fetches market cap, P/E, revenue, EPS, and YoY growth.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });
const { Ticker, IncomeStatement } = require('../models');
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

async function runFundamentalWorker() {
  const startTime = Date.now();
  logger.info('=== Yahoo Fundamental Worker START ===');

  try {
    // 1. Checkpointing: Frequency Separation
    // Only update stocks that haven't been updated in the last 12 hours
    const twelveHoursAgo = new Date();
    twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

    const { Op } = require('sequelize');
    const isForce = process.argv.includes('--force');

    const queryOptions = { attributes: ['symbol'], raw: true };
    if (!isForce) {
      queryOptions.where = {
        [Op.or]: [
          { last_fundamental_update: { [Op.lt]: twelveHoursAgo } },
          { last_fundamental_update: null }
        ]
      };
      logger.info('Checkpointing active: Only fetching stocks older than 12h.');
    } else {
      logger.info('FORCE mode: Fetching all stocks regardless of last update.');
    }

    const tickers = await Ticker.findAll(queryOptions);
    logger.info(`Loaded ${tickers.length} tickers to process.`);

    // 2. Smart Batching: Process 10 at a time
    const batches = chunkArray(tickers, 10);
    let processed = 0, errors = 0;

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];

      const fetchPromises = batch.map(async (t) => {
        const symbol = t.symbol;
        try {
          // Fetch quote and summary from Yahoo
          const [quote, summary] = await Promise.all([
            yf.quote(symbol).catch(() => null),
            yf.quoteSummary(symbol, { modules: ['financialData', 'incomeStatementHistoryQuarterly', 'assetProfile'] }).catch(() => null)
          ]);

          if (!quote || !summary) {
            throw new Error('No fundamental data found');
          }

          const fd = summary.financialData || {};
          const profile = summary.assetProfile || {};

          const updateData = {
            sector: profile.sector || null,
            industry: profile.industry || null,
            market_cap: quote.marketCap || null,
            pe_ratio: quote.trailingPE || null,
            ttm_eps: quote.epsTrailingTwelveMonths || null,
            ttm_revenue: fd.totalRevenue || null,
            latest_eps_yoy_growth: fd.earningsGrowth ? (fd.earningsGrowth * 100).toFixed(2) : null,
            last_fundamental_update: new Date()
          };

          // Update Ticker fundamentals
          await Ticker.update(updateData, { where: { symbol } });

          // If quarterly data is available, upsert it
          const qs = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
          if (qs.length > 0) {
            for (let qIdx = 0; qIdx < qs.length; qIdx++) {
              const stmt = qs[qIdx];
              if (!stmt.endDate) continue;

              const reportDate = new Date(stmt.endDate);
              const fiscalYear = reportDate.getFullYear();
              // Approximation of quarter
              const quarter = Math.floor((reportDate.getMonth() + 3) / 3);

              await IncomeStatement.upsert({
                symbol,
                period_type: 'Quarterly',
                fiscal_year: fiscalYear,
                fiscal_period: `Q${quarter}`,
                revenue: stmt.totalRevenue || null,
                gross_profit: stmt.grossProfit || null,
                operating_expenses: stmt.totalOperatingExpenses || null,
                operating_income: stmt.operatingIncome || null,
                net_income: stmt.netIncome || null,
                report_date: stmt.endDate,
                source_api: 'yahoo',
              });
            }
          }

          processed++;
          logger.debug(`✅ Processed ${symbol}`);
        } catch (err) {
          errors++;
          // Important: Even if it fails, update the timestamp so we don't endlessly retry!
          await Ticker.update({ last_fundamental_update: new Date() }, { where: { symbol } });
          logger.warn(`⚠️ Skipped ${symbol}: ${err.message}`);
        }
      });

      await Promise.all(fetchPromises);
      logger.info(`Completed batch ${i + 1}/${batches.length} (${processed} ok, ${errors} err)`);

      // 🛑 SLEEP: 1 second between batches
      await sleep(1000);
    }

    logger.info(`=== Yahoo Worker DONE === ${processed} ok, ${errors} errors in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  } catch (err) {
    logger.error('Fundamental worker fatal error', { error: err.message, stack: err.stack });
  }
}

if (process.argv.includes('--cron')) {
  const schedule = process.env.FUNDAMENTAL_WORKER_CRON || '0 20 * * 1-5';
  logger.info(`Yahoo Fundamental worker scheduled: ${schedule}`);
  cron.schedule(schedule, runFundamentalWorker, { timezone: 'America/New_York' });
} else {
  runFundamentalWorker().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { runFundamentalWorker };

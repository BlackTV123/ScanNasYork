/**
 * Fundamental Worker — Sequelize ORM Version
 * Schedule: 8:00 PM EST on weekdays.
 *
 * Usage:
 *   node workers/fundamental.js          # Run once
 *   node workers/fundamental.js --cron   # Run on schedule
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const { Ticker, IncomeStatement } = require('../models');
const { createApiClients, sleep } = require('../utils/api-clients');
const logger = require('../utils/logger');

async function runFundamentalWorker() {
  const startTime = Date.now();
  logger.info('=== Fundamental Worker START ===');

  const { fmp } = createApiClients();

  try {
    const today = new Date().toISOString().split('T')[0];
    const earnings = await fmp.getEarningsCalendar(today, today);
    const earningsSymbols = (earnings || []).map(e => e.symbol).filter(s => s && !s.includes('.'));
    logger.info(`Found ${earningsSymbols.length} companies with earnings today`);

    const tickers = await Ticker.findAll({ attributes: ['symbol'], raw: true });
    const known = new Set(tickers.map(r => r.symbol));
    const toProcess = earningsSymbols.filter(s => known.has(s));
    logger.info(`${toProcess.length} match tracked tickers`);

    let processed = 0, errors = 0;

    for (const symbol of toProcess) {
      try {
        await processCompanyFundamentals(fmp, symbol);
        processed++;
        await sleep(500);
      } catch (err) {
        errors++;
        logger.error(`Failed fundamentals for ${symbol}`, { error: err.message });
      }
    }

    logger.info(`=== Fundamental Worker DONE === ${processed} ok, ${errors} errors in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  } catch (err) {
    logger.error('Fundamental worker fatal', { error: err.message, stack: err.stack });
  }
}

async function processCompanyFundamentals(fmp, symbol) {
  const quarterly = await fmp.getIncomeStatement(symbol, 'quarter', 8);
  if (!quarterly || quarterly.length === 0) return;

  const annual = await fmp.getIncomeStatement(symbol, 'annual', 2);

  // Upsert quarterly
  for (const stmt of quarterly) {
    const fiscalPeriod = stmt.period || 'Q?';
    const fiscalYear = stmt.calendarYear ? parseInt(stmt.calendarYear) : new Date(stmt.date).getFullYear();

    await IncomeStatement.upsert({
      symbol, period_type: 'Quarterly', fiscal_year: fiscalYear, fiscal_period: fiscalPeriod,
      revenue: stmt.revenue, cost_of_revenue: stmt.costOfRevenue,
      gross_profit: stmt.grossProfit, operating_expenses: stmt.operatingExpenses,
      operating_income: stmt.operatingIncome, net_income: stmt.netIncome,
      eps: stmt.eps, shares_outstanding: stmt.weightedAverageShsOut,
      report_date: stmt.date, filing_date: stmt.fillingDate || stmt.filingDate,
      source_api: 'fmp',
    });
  }

  // Upsert annual
  if (annual) {
    for (const stmt of annual) {
      await IncomeStatement.upsert({
        symbol, period_type: 'Annual',
        fiscal_year: stmt.calendarYear ? parseInt(stmt.calendarYear) : new Date(stmt.date).getFullYear(),
        fiscal_period: 'FY',
        revenue: stmt.revenue, cost_of_revenue: stmt.costOfRevenue,
        gross_profit: stmt.grossProfit, operating_expenses: stmt.operatingExpenses,
        operating_income: stmt.operatingIncome, net_income: stmt.netIncome,
        eps: stmt.eps, shares_outstanding: stmt.weightedAverageShsOut,
        report_date: stmt.date, filing_date: stmt.fillingDate || stmt.filingDate,
        source_api: 'fmp',
      });
    }
  }

  // TTM calculation
  const last4 = quarterly.slice(0, 4);
  const ttmRevenue = last4.reduce((s, q) => s + (q.revenue || 0), 0);
  const ttmEps = last4.reduce((s, q) => s + (q.eps || 0), 0);
  const ttmNetIncome = last4.reduce((s, q) => s + (q.netIncome || 0), 0);

  let epsYoy = null;
  if (quarterly.length >= 5 && quarterly[4].eps && quarterly[4].eps !== 0) {
    epsYoy = ((quarterly[0].eps - quarterly[4].eps) / Math.abs(quarterly[4].eps) * 100).toFixed(2);
  }

  const ticker = await Ticker.findOne({ where: { symbol }, raw: true });
  let peRatio = null;
  if (ticker?.current_price && ttmEps > 0) {
    peRatio = (parseFloat(ticker.current_price) / ttmEps).toFixed(2);
  }

  await Ticker.update({
    ttm_revenue: ttmRevenue, ttm_eps: ttmEps.toFixed(2), ttm_net_income: ttmNetIncome,
    latest_eps_yoy_growth: epsYoy, pe_ratio: peRatio, last_fundamental_update: new Date(),
  }, { where: { symbol } });

  logger.info(`Updated TTM for ${symbol}`);
}

if (process.argv.includes('--cron')) {
  const schedule = process.env.FUNDAMENTAL_WORKER_CRON || '0 20 * * 1-5';
  logger.info(`Fundamental worker scheduled: ${schedule}`);
  cron.schedule(schedule, runFundamentalWorker, { timezone: 'America/New_York' });
} else {
  runFundamentalWorker().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { runFundamentalWorker };

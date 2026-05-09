/**
 * Fundamental Worker
 * Fetches earnings data from Financial Modeling Prep (FMP).
 * Schedule: 8:00 PM EST (00:00 UTC next day) on weekdays.
 *
 * Usage:
 *   node workers/fundamental.js          # Run once
 *   node workers/fundamental.js --cron   # Run on schedule
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const cron = require('node-cron');
const { query } = require('../db/pool');
const { createApiClients, sleep } = require('../utils/api-clients');
const logger = require('../utils/logger');

async function runFundamentalWorker() {
  const startTime = Date.now();
  logger.info('=== Fundamental Worker START ===');

  const { fmp } = createApiClients();

  try {
    const today = new Date().toISOString().split('T')[0];
    logger.info(`Checking earnings calendar for: ${today}`);

    // 1. Get today's earnings calendar
    const earnings = await fmp.getEarningsCalendar(today, today);
    const earningsSymbols = (earnings || [])
      .map(e => e.symbol)
      .filter(s => s && !s.includes('.'));

    logger.info(`Found ${earningsSymbols.length} companies with earnings today`);

    // 2. Filter to only symbols we track
    const tickerResult = await query('SELECT symbol FROM Tickers');
    const knownSymbols = new Set(tickerResult.rows.map(r => r.symbol));
    const toProcess = earningsSymbols.filter(s => knownSymbols.has(s));

    logger.info(`${toProcess.length} earnings match tracked tickers`);

    let processed = 0;
    let errors = 0;

    // 3. Process each company
    for (const symbol of toProcess) {
      try {
        await processCompanyFundamentals(fmp, symbol);
        processed++;
        await sleep(500); // Respect rate limits (250/day)
      } catch (err) {
        errors++;
        logger.error(`Failed fundamentals for ${symbol}`, { error: err.message });
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(`=== Fundamental Worker DONE === ${processed} processed, ${errors} errors in ${duration}s`);
  } catch (err) {
    logger.error('Fundamental worker fatal error', { error: err.message, stack: err.stack });
  }
}

/**
 * Fetch and store income statements for a single company.
 */
async function processCompanyFundamentals(fmp, symbol) {
  // Fetch quarterly income statements (last 8 quarters)
  const quarterly = await fmp.getIncomeStatement(symbol, 'quarter', 8);
  if (!quarterly || quarterly.length === 0) {
    logger.warn(`No quarterly data for ${symbol}`);
    return;
  }

  // Fetch annual income statements (last 2 years)
  const annual = await fmp.getIncomeStatement(symbol, 'annual', 2);

  // Insert quarterly statements
  for (const stmt of quarterly) {
    await upsertIncomeStatement(symbol, 'Quarterly', stmt);
  }

  // Insert annual statements
  if (annual) {
    for (const stmt of annual) {
      await upsertIncomeStatement(symbol, 'Annual', stmt);
    }
  }

  // Calculate TTM values from last 4 quarters
  await updateTTMValues(symbol, quarterly);
}

/**
 * Upsert an income statement record.
 */
async function upsertIncomeStatement(symbol, periodType, stmt) {
  const fiscalPeriod = periodType === 'Annual' ? 'FY' : (stmt.period || 'Q?');
  const fiscalYear = stmt.calendarYear ? parseInt(stmt.calendarYear, 10) : new Date(stmt.date).getFullYear();

  await query(
    `INSERT INTO Income_Statements
       (symbol, period_type, fiscal_year, fiscal_period, revenue, cost_of_revenue,
        gross_profit, operating_expenses, operating_income, net_income, eps,
        shares_outstanding, report_date, filing_date, source_api)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'fmp')
     ON CONFLICT (symbol, fiscal_year, fiscal_period) DO UPDATE SET
       revenue = EXCLUDED.revenue,
       cost_of_revenue = EXCLUDED.cost_of_revenue,
       gross_profit = EXCLUDED.gross_profit,
       operating_expenses = EXCLUDED.operating_expenses,
       operating_income = EXCLUDED.operating_income,
       net_income = EXCLUDED.net_income,
       eps = EXCLUDED.eps,
       shares_outstanding = EXCLUDED.shares_outstanding,
       report_date = EXCLUDED.report_date,
       filing_date = EXCLUDED.filing_date`,
    [
      symbol, periodType, fiscalYear, fiscalPeriod,
      stmt.revenue || null,
      stmt.costOfRevenue || null,
      stmt.grossProfit || null,
      stmt.operatingExpenses || null,
      stmt.operatingIncome || null,
      stmt.netIncome || null,
      stmt.eps || null,
      stmt.weightedAverageShsOut || null,
      stmt.date || null,
      stmt.fillingDate || stmt.filingDate || null,
    ]
  );
}

/**
 * Calculate TTM (Trailing Twelve Months) values and update Tickers table.
 */
async function updateTTMValues(symbol, quarterlyStmts) {
  // Take last 4 quarters for TTM
  const last4 = quarterlyStmts.slice(0, 4);
  if (last4.length < 4) {
    logger.warn(`Only ${last4.length} quarters available for ${symbol} TTM`);
  }

  const ttmRevenue = last4.reduce((sum, q) => sum + (q.revenue || 0), 0);
  const ttmEps = last4.reduce((sum, q) => sum + (q.eps || 0), 0);
  const ttmNetIncome = last4.reduce((sum, q) => sum + (q.netIncome || 0), 0);

  // YoY EPS Growth: compare latest quarter to same quarter last year
  let epsYoyGrowth = null;
  if (quarterlyStmts.length >= 5) {
    const current = quarterlyStmts[0];
    const lastYear = quarterlyStmts[4]; // Same quarter, previous year
    if (lastYear.eps && lastYear.eps !== 0) {
      epsYoyGrowth = parseFloat((((current.eps - lastYear.eps) / Math.abs(lastYear.eps)) * 100).toFixed(2));
    }
  }

  // P/E ratio
  let peRatio = null;
  const priceResult = await query('SELECT current_price FROM Tickers WHERE symbol = $1', [symbol]);
  if (priceResult.rows[0]?.current_price && ttmEps && ttmEps > 0) {
    peRatio = parseFloat((parseFloat(priceResult.rows[0].current_price) / ttmEps).toFixed(2));
  }

  await query(
    `UPDATE Tickers SET
       ttm_revenue = $1, ttm_eps = $2, ttm_net_income = $3,
       latest_eps_yoy_growth = $4, pe_ratio = $5,
       last_fundamental_update = NOW()
     WHERE symbol = $6`,
    [ttmRevenue, parseFloat(ttmEps.toFixed(2)), ttmNetIncome, epsYoyGrowth, peRatio, symbol]
  );

  logger.info(`Updated TTM for ${symbol}: Revenue=${ttmRevenue}, EPS=${ttmEps.toFixed(2)}, P/E=${peRatio}`);
}

// ============================================
// Entry Point
// ============================================
if (process.argv.includes('--cron')) {
  const schedule = process.env.FUNDAMENTAL_WORKER_CRON || '0 20 * * 1-5';
  logger.info(`Fundamental worker scheduled: ${schedule}`);
  cron.schedule(schedule, runFundamentalWorker, { timezone: 'America/New_York' });
} else {
  runFundamentalWorker().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = { runFundamentalWorker };

/**
 * Database Seeder
 * Populates Tickers table with NYSE/NASDAQ stocks using Polygon.io API.
 * Also generates demo data for development/testing.
 *
 * Usage:
 *   node db/seed.js              # Seed from API
 *   node db/seed.js --demo       # Seed with demo data
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { query, pool } = require('./pool');
const { createApiClients, sleep } = require('../utils/api-clients');
const logger = require('../utils/logger');

// Demo tickers for development without API keys
const DEMO_TICKERS = [
  { symbol: 'AAPL', name: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics', mcap: 2800000000000 },
  { symbol: 'MSFT', name: 'Microsoft Corporation', sector: 'Technology', industry: 'Software', mcap: 3100000000000 },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', sector: 'Technology', industry: 'Internet Content', mcap: 2100000000000 },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', sector: 'Consumer Cyclical', industry: 'Internet Retail', mcap: 1900000000000 },
  { symbol: 'NVDA', name: 'NVIDIA Corporation', sector: 'Technology', industry: 'Semiconductors', mcap: 2700000000000 },
  { symbol: 'META', name: 'Meta Platforms Inc.', sector: 'Technology', industry: 'Internet Content', mcap: 1300000000000 },
  { symbol: 'TSLA', name: 'Tesla Inc.', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', mcap: 800000000000 },
  { symbol: 'BRK.B', name: 'Berkshire Hathaway', sector: 'Financial Services', industry: 'Insurance', mcap: 780000000000 },
  { symbol: 'JPM', name: 'JPMorgan Chase & Co.', sector: 'Financial Services', industry: 'Banks', mcap: 590000000000 },
  { symbol: 'JNJ', name: 'Johnson & Johnson', sector: 'Healthcare', industry: 'Drug Manufacturers', mcap: 470000000000 },
  { symbol: 'V', name: 'Visa Inc.', sector: 'Financial Services', industry: 'Credit Services', mcap: 560000000000 },
  { symbol: 'PG', name: 'Procter & Gamble', sector: 'Consumer Defensive', industry: 'Household Products', mcap: 380000000000 },
  { symbol: 'UNH', name: 'UnitedHealth Group', sector: 'Healthcare', industry: 'Healthcare Plans', mcap: 520000000000 },
  { symbol: 'HD', name: 'The Home Depot', sector: 'Consumer Cyclical', industry: 'Home Improvement', mcap: 370000000000 },
  { symbol: 'MA', name: 'Mastercard Inc.', sector: 'Financial Services', industry: 'Credit Services', mcap: 430000000000 },
  { symbol: 'DIS', name: 'Walt Disney Company', sector: 'Communication Services', industry: 'Entertainment', mcap: 200000000000 },
  { symbol: 'NFLX', name: 'Netflix Inc.', sector: 'Communication Services', industry: 'Entertainment', mcap: 280000000000 },
  { symbol: 'ADBE', name: 'Adobe Inc.', sector: 'Technology', industry: 'Software', mcap: 230000000000 },
  { symbol: 'CRM', name: 'Salesforce Inc.', sector: 'Technology', industry: 'Software', mcap: 250000000000 },
  { symbol: 'PFE', name: 'Pfizer Inc.', sector: 'Healthcare', industry: 'Drug Manufacturers', mcap: 160000000000 },
  { symbol: 'AMD', name: 'Advanced Micro Devices', sector: 'Technology', industry: 'Semiconductors', mcap: 220000000000 },
  { symbol: 'INTC', name: 'Intel Corporation', sector: 'Technology', industry: 'Semiconductors', mcap: 130000000000 },
  { symbol: 'KO', name: 'Coca-Cola Company', sector: 'Consumer Defensive', industry: 'Beverages', mcap: 270000000000 },
  { symbol: 'PEP', name: 'PepsiCo Inc.', sector: 'Consumer Defensive', industry: 'Beverages', mcap: 240000000000 },
  { symbol: 'BA', name: 'Boeing Company', sector: 'Industrials', industry: 'Aerospace & Defense', mcap: 130000000000 },
  { symbol: 'XOM', name: 'Exxon Mobil', sector: 'Energy', industry: 'Oil & Gas', mcap: 460000000000 },
  { symbol: 'CVX', name: 'Chevron Corporation', sector: 'Energy', industry: 'Oil & Gas', mcap: 290000000000 },
  { symbol: 'WMT', name: 'Walmart Inc.', sector: 'Consumer Defensive', industry: 'Discount Stores', mcap: 430000000000 },
  { symbol: 'COST', name: 'Costco Wholesale', sector: 'Consumer Defensive', industry: 'Discount Stores', mcap: 340000000000 },
  { symbol: 'PYPL', name: 'PayPal Holdings', sector: 'Financial Services', industry: 'Credit Services', mcap: 80000000000 },
];

async function seedFromAPI() {
  const { polygon } = createApiClients();
  logger.info('Fetching all active tickers from Polygon.io...');
  const tickers = await polygon.getAllTickers();
  logger.info(`Received ${tickers.length} tickers`);

  let inserted = 0;
  for (const t of tickers) {
    if (!t.ticker || !t.name) continue;
    try {
      await query(
        `INSERT INTO Tickers (symbol, company_name, sector, industry, market_cap)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (symbol) DO UPDATE SET company_name = EXCLUDED.company_name`,
        [t.ticker, t.name, t.sic_description || null, null, t.market_cap || null]
      );
      inserted++;
    } catch (err) {
      logger.debug(`Skip ${t.ticker}: ${err.message}`);
    }
  }
  logger.info(`Inserted/updated ${inserted} tickers`);
}

async function seedDemo() {
  logger.info('Seeding demo data...');

  // Insert tickers
  for (const t of DEMO_TICKERS) {
    await query(
      `INSERT INTO Tickers (symbol, company_name, sector, industry, market_cap,
         current_price, price_change_pct, ttm_eps, ttm_revenue, pe_ratio, latest_eps_yoy_growth)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (symbol) DO NOTHING`,
      [t.symbol, t.name, t.sector, t.industry, t.mcap,
       (100 + Math.random() * 400).toFixed(2),
       (-5 + Math.random() * 10).toFixed(2),
       (1 + Math.random() * 15).toFixed(2),
       Math.floor(t.mcap * (0.1 + Math.random() * 0.3)),
       (10 + Math.random() * 40).toFixed(2),
       (-20 + Math.random() * 60).toFixed(2)]
    );
  }

  // Insert 30 days of daily metrics for each ticker
  for (const t of DEMO_TICKERS) {
    let price = 100 + Math.random() * 300;
    for (let d = 30; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;
      const dateStr = date.toISOString().split('T')[0];

      const change = (Math.random() - 0.48) * 5;
      price = Math.max(10, price + change);
      const o = price - Math.random() * 2;
      const h = price + Math.random() * 3;
      const l = price - Math.random() * 3;
      const c = price;
      const v = Math.floor(1000000 + Math.random() * 50000000);

      await query(
        `INSERT INTO Daily_Metrics (symbol, date, open, high, low, close, volume,
           rsi_14, rsi_7, macd, macd_signal, macd_histogram,
           sma_20, sma_50, sma_200)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (symbol, date) DO NOTHING`,
        [t.symbol, dateStr, o.toFixed(2), h.toFixed(2), l.toFixed(2), c.toFixed(2), v,
         (20 + Math.random() * 60).toFixed(2), (20 + Math.random() * 60).toFixed(2),
         (-2 + Math.random() * 4).toFixed(4), (-1 + Math.random() * 2).toFixed(4),
         (-1 + Math.random() * 2).toFixed(4),
         (price - 5 + Math.random() * 10).toFixed(2),
         (price - 10 + Math.random() * 20).toFixed(2),
         (price - 20 + Math.random() * 40).toFixed(2)]
      );
    }

    // Update current_price on Tickers
    await query(
      `UPDATE Tickers SET current_price = $1, last_technical_update = NOW() WHERE symbol = $2`,
      [price.toFixed(2), t.symbol]
    );
  }

  // Insert sample quarterly income statements
  for (const t of DEMO_TICKERS) {
    const baseRev = Math.floor(t.mcap * 0.05);
    for (let q = 0; q < 8; q++) {
      const year = q < 4 ? 2024 : 2023;
      const period = `Q${(q % 4) + 1}`;
      const rev = baseRev + Math.floor((Math.random() - 0.3) * baseRev * 0.2);
      const ni = Math.floor(rev * (0.05 + Math.random() * 0.2));
      const eps = parseFloat((ni / 1000000000).toFixed(2));
      const reportDate = new Date(year, (q % 4) * 3 + 2, 15);

      await query(
        `INSERT INTO Income_Statements
           (symbol, period_type, fiscal_year, fiscal_period, revenue, net_income, eps, report_date, source_api)
         VALUES ($1, 'Quarterly', $2, $3, $4, $5, $6, $7, 'demo')
         ON CONFLICT (symbol, fiscal_year, fiscal_period) DO NOTHING`,
        [t.symbol, year, period, rev, ni, eps, reportDate.toISOString().split('T')[0]]
      );
    }
  }

  logger.info(`Seeded ${DEMO_TICKERS.length} tickers with 30 days of metrics and quarterly earnings`);
}

// Entry
(async () => {
  try {
    if (process.argv.includes('--demo')) {
      await seedDemo();
    } else {
      await seedFromAPI();
    }
  } catch (err) {
    logger.error('Seed failed', { error: err.message });
  } finally {
    await pool.end();
    process.exit(0);
  }
})();

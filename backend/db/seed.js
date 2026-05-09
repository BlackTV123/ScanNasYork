/**
 * Database Seeder — Sequelize ORM Version
 *
 * Usage:
 *   npm run db:seed -- --demo   # Seed with demo data (no API keys needed)
 *   npm run db:seed             # Seed from Polygon.io API
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sequelize, Ticker, DailyMetric, IncomeStatement } = require('../models');
const { createApiClients, sleep } = require('../utils/api-clients');
const logger = require('../utils/logger');

const DEMO_TICKERS = [
  { symbol: 'AAPL', company_name: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics', market_cap: 2800000000000 },
  { symbol: 'MSFT', company_name: 'Microsoft Corporation', sector: 'Technology', industry: 'Software', market_cap: 3100000000000 },
  { symbol: 'GOOGL', company_name: 'Alphabet Inc.', sector: 'Technology', industry: 'Internet Content', market_cap: 2100000000000 },
  { symbol: 'AMZN', company_name: 'Amazon.com Inc.', sector: 'Consumer Cyclical', industry: 'Internet Retail', market_cap: 1900000000000 },
  { symbol: 'NVDA', company_name: 'NVIDIA Corporation', sector: 'Technology', industry: 'Semiconductors', market_cap: 2700000000000 },
  { symbol: 'META', company_name: 'Meta Platforms Inc.', sector: 'Technology', industry: 'Internet Content', market_cap: 1300000000000 },
  { symbol: 'TSLA', company_name: 'Tesla Inc.', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers', market_cap: 800000000000 },
  { symbol: 'JPM', company_name: 'JPMorgan Chase & Co.', sector: 'Financial Services', industry: 'Banks', market_cap: 590000000000 },
  { symbol: 'JNJ', company_name: 'Johnson & Johnson', sector: 'Healthcare', industry: 'Drug Manufacturers', market_cap: 470000000000 },
  { symbol: 'V', company_name: 'Visa Inc.', sector: 'Financial Services', industry: 'Credit Services', market_cap: 560000000000 },
  { symbol: 'PG', company_name: 'Procter & Gamble', sector: 'Consumer Defensive', industry: 'Household Products', market_cap: 380000000000 },
  { symbol: 'UNH', company_name: 'UnitedHealth Group', sector: 'Healthcare', industry: 'Healthcare Plans', market_cap: 520000000000 },
  { symbol: 'HD', company_name: 'The Home Depot', sector: 'Consumer Cyclical', industry: 'Home Improvement', market_cap: 370000000000 },
  { symbol: 'MA', company_name: 'Mastercard Inc.', sector: 'Financial Services', industry: 'Credit Services', market_cap: 430000000000 },
  { symbol: 'DIS', company_name: 'Walt Disney Company', sector: 'Communication Services', industry: 'Entertainment', market_cap: 200000000000 },
  { symbol: 'NFLX', company_name: 'Netflix Inc.', sector: 'Communication Services', industry: 'Entertainment', market_cap: 280000000000 },
  { symbol: 'ADBE', company_name: 'Adobe Inc.', sector: 'Technology', industry: 'Software', market_cap: 230000000000 },
  { symbol: 'CRM', company_name: 'Salesforce Inc.', sector: 'Technology', industry: 'Software', market_cap: 250000000000 },
  { symbol: 'PFE', company_name: 'Pfizer Inc.', sector: 'Healthcare', industry: 'Drug Manufacturers', market_cap: 160000000000 },
  { symbol: 'AMD', company_name: 'Advanced Micro Devices', sector: 'Technology', industry: 'Semiconductors', market_cap: 220000000000 },
  { symbol: 'INTC', company_name: 'Intel Corporation', sector: 'Technology', industry: 'Semiconductors', market_cap: 130000000000 },
  { symbol: 'KO', company_name: 'Coca-Cola Company', sector: 'Consumer Defensive', industry: 'Beverages', market_cap: 270000000000 },
  { symbol: 'PEP', company_name: 'PepsiCo Inc.', sector: 'Consumer Defensive', industry: 'Beverages', market_cap: 240000000000 },
  { symbol: 'BA', company_name: 'Boeing Company', sector: 'Industrials', industry: 'Aerospace & Defense', market_cap: 130000000000 },
  { symbol: 'XOM', company_name: 'Exxon Mobil', sector: 'Energy', industry: 'Oil & Gas', market_cap: 460000000000 },
  { symbol: 'CVX', company_name: 'Chevron Corporation', sector: 'Energy', industry: 'Oil & Gas', market_cap: 290000000000 },
  { symbol: 'WMT', company_name: 'Walmart Inc.', sector: 'Consumer Defensive', industry: 'Discount Stores', market_cap: 430000000000 },
  { symbol: 'COST', company_name: 'Costco Wholesale', sector: 'Consumer Defensive', industry: 'Discount Stores', market_cap: 340000000000 },
  { symbol: 'PYPL', company_name: 'PayPal Holdings', sector: 'Financial Services', industry: 'Credit Services', market_cap: 80000000000 },
  { symbol: 'LLY', company_name: 'Eli Lilly and Company', sector: 'Healthcare', industry: 'Drug Manufacturers', market_cap: 680000000000 },
];

async function seedDemo() {
  logger.info('Syncing database models...');
  await sequelize.sync({ force: true }); // Recreates tables
  logger.info('Tables created');

  logger.info('Seeding demo tickers...');
  for (const t of DEMO_TICKERS) {
    const price = (100 + Math.random() * 400).toFixed(2);
    const ttmEps = (1 + Math.random() * 15).toFixed(2);

    await Ticker.create({
      ...t,
      current_price: price,
      price_change_pct: (-5 + Math.random() * 10).toFixed(2),
      ttm_eps: ttmEps,
      ttm_revenue: Math.floor(t.market_cap * (0.1 + Math.random() * 0.3)),
      ttm_net_income: Math.floor(t.market_cap * 0.03),
      pe_ratio: (10 + Math.random() * 40).toFixed(2),
      latest_eps_yoy_growth: (-20 + Math.random() * 60).toFixed(2),
      last_technical_update: new Date(),
    });

    // Generate 30 days of daily metrics
    let p = parseFloat(price) * 0.92;
    for (let d = 30; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      if (date.getDay() === 0 || date.getDay() === 6) continue;

      const change = (Math.random() - 0.48) * 5;
      p = Math.max(10, p + change);

      await DailyMetric.create({
        symbol: t.symbol,
        date: date.toISOString().split('T')[0],
        open: (p - Math.random() * 2).toFixed(2),
        high: (p + Math.random() * 3).toFixed(2),
        low: (p - Math.random() * 3).toFixed(2),
        close: p.toFixed(2),
        volume: Math.floor(1000000 + Math.random() * 50000000),
        rsi_14: (20 + Math.random() * 60).toFixed(2),
        rsi_7: (20 + Math.random() * 60).toFixed(2),
        macd: (-2 + Math.random() * 4).toFixed(4),
        macd_signal: (-1 + Math.random() * 2).toFixed(4),
        macd_histogram: (Math.random() * 2 - 1).toFixed(4),
        bb_upper: (p * 1.05).toFixed(2),
      });
    }

    // Quarterly earnings (8 quarters)
    const baseRev = Math.floor(t.market_cap * 0.05);
    for (let q = 0; q < 8; q++) {
      const year = q < 4 ? 2024 : 2023;
      const period = `Q${(q % 4) + 1}`;
      const rev = baseRev + Math.floor((Math.random() - 0.3) * baseRev * 0.2);
      const ni = Math.floor(rev * (0.05 + Math.random() * 0.2));

      await IncomeStatement.create({
        symbol: t.symbol,
        period_type: 'Quarterly',
        fiscal_year: year,
        fiscal_period: period,
        revenue: rev,
        net_income: ni,
        eps: (ni / 1e9).toFixed(4),
        report_date: new Date(year, (q % 4) * 3 + 2, 15).toISOString().split('T')[0],
        source_api: 'demo',
      });
    }
  }

  logger.info(`Seeded ${DEMO_TICKERS.length} tickers with metrics and earnings`);
}

async function seedFromAPI() {
  await sequelize.sync();
  const { polygon } = createApiClients();
  logger.info('Fetching tickers from Polygon.io...');
  const tickers = await polygon.getAllTickers();
  logger.info(`Received ${tickers.length} tickers`);

  let inserted = 0;
  for (const t of tickers) {
    if (!t.ticker || !t.name) continue;
    try {
      await Ticker.upsert({
        symbol: t.ticker,
        company_name: t.name,
        sector: t.sic_description || null,
        market_cap: t.market_cap || null,
      });
      inserted++;
    } catch (err) {
      logger.debug(`Skip ${t.ticker}: ${err.message}`);
    }
  }
  logger.info(`Inserted/updated ${inserted} tickers`);
}

(async () => {
  try {
    if (process.argv.includes('--demo')) {
      await seedDemo();
    } else {
      await seedFromAPI();
    }
  } catch (err) {
    logger.error('Seed failed', { error: err.message, stack: err.stack });
  } finally {
    await sequelize.close();
    process.exit(0);
  }
})();

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

test('MySQL schema, screener, favorites, upserts, transactions and migrations', async () => {
  // Only this generated database is created and removed. Never seed the user's DB.
  const database = `scannas_york_test_${process.pid}_${Date.now()}`;
  const originalDatabase = process.env.DB_NAME;
  const admin = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
    connectTimeout: 5000,
  });
  let created = false;
  let sequelize;
  let pool;
  let server;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    process.env.DB_NAME = database;
    const models = require('../models');
    sequelize = models.sequelize;
    sequelize.options.logging = false;
    const { Ticker, IncomeStatement } = models;
    const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
    // Execute twice to check that the reference schema is valid and non-destructive.
    for (let i = 0; i < 2; i++) {
      for (const statement of schema.split(';').filter(s => /CREATE TABLE/.test(s))) {
        await sequelize.query(statement);
      }
    }
    await sequelize.sync();
    // Upgrade a pre-currency installation twice without rebuilding existing tables.
    await sequelize.getQueryInterface().removeColumn('income_statements', 'currency');
    for (let attempt = 0; attempt < 2; attempt++) {
      execFileSync(process.execPath, [path.join(__dirname, '../db/init.js')], { env: process.env, stdio: 'pipe' });
    }
    assert.ok((await sequelize.getQueryInterface().describeTable('income_statements')).currency);
    await assert.rejects(require('../workers/daily-technical').runTechnicalWorker(), /Run npm run db:seed first/);
    await assert.rejects(require('../workers/fundamental').runFundamentalWorker(), /Run npm run db:seed first/);
    await Ticker.bulkCreate([
      { symbol: 'AAA', company_name: 'Alpha Technology', sector: 'Technology', current_price: 100,
        target_mean_price: 150, rsi_14: 40, macd: 2, bb_upper: 102, bb_middle: 100, bb_lower: 98,
        market_cap: '2800000000000', ttm_eps: '2.50', is_favorite: true },
      { symbol: 'BBB', company_name: 'Beta Technology', sector: 'Technology', current_price: 200,
        target_mean_price: 210, rsi_14: 70, macd: -1, bb_upper: 240, bb_middle: 200, bb_lower: 160 },
      { symbol: 'CCC', company_name: 'Gamma AAA Health', sector: 'Healthcare' },
    ]);
    await Ticker.bulkCreate([{ symbol: 'AAA', company_name: 'Imported directory name' }], { ignoreDuplicates: true });
    const preserved = await Ticker.findOne({ where: { symbol: 'AAA' } });
    assert.equal(preserved.company_name, 'Alpha Technology');
    assert.equal(preserved.is_favorite, true);
    assert.equal(Number(preserved.current_price), 100);
    const express = require('express');
    const app = express();
    app.use(express.json());
    app.use('/api/v1/stocks', require('../api/routes/stocks'));
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    const base = `http://127.0.0.1:${server.address().port}/api/v1/stocks`;
    async function get(route) {
      const res = await fetch(base + route);
      const body = await res.json();
      assert.equal(res.status, 200, JSON.stringify(body));
      return body;
    }
    assert.deepEqual((await get('/screen?search=aLpHa')).data.map(t => t.symbol), ['AAA']);
    assert.deepEqual((await get('/screen?search=aaa')).data.map(t => t.symbol), ['AAA']);
    assert.deepEqual((await get('/screen?search=%20aAa%20')).data.map(t => t.symbol), ['AAA']);
    assert.equal((await get('/screen?search=AAA&sector=Healthcare')).pagination.total_results, 0);
    assert.deepEqual((await get('/screen?search=aa')).data.map(t => t.symbol), ['AAA', 'CCC']);
    assert.equal((await get('/screen?search=%25')).pagination.total_results, 0);
    assert.equal((await get('/screen?search=_')).pagination.total_results, 0);
    assert.equal((await get('/screen?search=%20%20')).pagination.total_results, 3);
    for (const direction of ['asc', 'desc']) {
      const data = (await get(`/screen?sort_by=current_price&sort_order=${direction}`)).data;
      assert.deepEqual(data.map(t => t.symbol), direction === 'asc' ? ['AAA', 'BBB', 'CCC'] : ['BBB', 'AAA', 'CCC']);
    }
    for (const sort of ['target_mean_price', 'revenue_yoy_growth', 'revenue_consecutive_years']) {
      await get(`/screen?sort_by=${sort}`);
    }
    const filtered = await get('/screen?macd_positive=true&building_base=true&upside_min=30&rsi_max=50');
    assert.deepEqual(filtered.data.map(t => t.symbol), ['AAA']);
    assert.equal(String(filtered.data[0].market_cap), '2800000000000');
    assert.equal(Number(filtered.data[0].ttm_eps), 2.5);
    const page = await get('/screen?limit=1&offset=1');
    assert.equal(page.pagination.total_results, 3);
    assert.deepEqual(page.data.map(t => t.symbol), ['BBB']);
    assert.equal((await get('/screen?favorites_only=true')).data[0].is_favorite, true);
    const fav = await fetch(base + '/BBB/favorite', { method: 'POST' });
    assert.equal(fav.status, 200);
    assert.equal((await fav.json()).is_favorite, true);
    assert.equal((await get('/BBB')).data.is_favorite, true);
    const statement = { symbol: 'AAA', period_type: 'Annual', fiscal_year: 2025,
      fiscal_period: 'FY', report_date: '2026-01-01', revenue: 100 };
    await IncomeStatement.bulkCreate([statement], { updateOnDuplicate: ['revenue'] });
    await IncomeStatement.bulkCreate([{ ...statement, revenue: 200 }], { updateOnDuplicate: ['revenue'] });
    assert.equal(await IncomeStatement.count(), 1);
    assert.equal(Number((await get('/AAA')).data.annual_history[0].revenue), 200);
    await IncomeStatement.create({ symbol: 'CCC', period_type: 'Annual', fiscal_year: 2025,
      fiscal_period: 'FY', report_date: '2025-12-31', revenue: 1000, eps: 2,
      currency: 'DKK', source_api: 'yahoo_finance' });
    const foreignHistory = await get('/CCC/financial-chart');
    assert.equal(foreignHistory.data.annual[0].currency, 'DKK');
    assert.equal(foreignHistory.data.annual[0].revenue, 1000);
    assert.equal((await get('/CCC')).data.annual_history[0].currency, 'DKK');
    for (let attempt = 0; attempt < 2; attempt++) {
      execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts/migrate-ticker-columns.js')], { env: process.env, stdio: 'pipe' });
    }
    assert.deepEqual((await sequelize.getQueryInterface().showAllTables()).sort(), ['economic_series', 'income_statements', 'tickers']);
    const economics = require('../services/markets/economic-store');
    const savedEconomic = { id: 'policy:CH', country: 'CH', rows: [{ period: '2026-10-27', value: 0 }], fetched_at: '2026-10-29T12:00:00.000Z' };
    await economics.save('policy', [savedEconomic]);
    await economics.save('policy', [savedEconomic]);
    const economicRows = await economics.load('policy');
    assert.equal(economicRows.length, 1);
    assert.equal(economicRows[0].rows[0].value, 0);
    assert.equal(economicRows[0].fetched_at, savedEconomic.fetched_at);
    const db = require('../db/pool');
    pool = db.pool;
    await assert.rejects(db.transaction(async client => {
      await client.query('UPDATE tickers SET company_name = ? WHERE symbol = ?', ['Rolled back', 'AAA']);
      throw new Error('test rollback');
    }), /test rollback/);
    const [rows] = await db.query('SELECT company_name FROM tickers WHERE symbol = ?', ['AAA']);
    assert.equal(rows[0].company_name, 'Alpha Technology');
    const priceService = require('../services/stocks/chart-data').createChartDataService({
      ticker: Ticker,
      yahoo: {
        chart: async () => ({ quotes: [{ date: new Date('2026-01-03'), open: 100, high: 115, low: 98, close: 112, volume: 20 }] }),
        quote: async () => ({ regularMarketPreviousClose: 100 }),
      },
    });
    const snapshot = await priceService.get('AAA', '1d', '1d', { refresh: true });
    const savedPrice = await Ticker.findOne({ where: { symbol: 'AAA' } });
    assert.equal(Number(savedPrice.current_price), snapshot.data.at(-1).close);
    assert.equal(savedPrice.last_technical_update, null);
    const selection = require('../utils/worker-selection');
    await Ticker.update({ last_fundamental_update: new Date(), last_sec_update: null }, { where: { symbol: 'AAA' } });
    await Ticker.update({ last_fundamental_update: new Date(), last_sec_update: new Date(), last_technical_update: new Date() }, { where: { symbol: 'BBB' } });
    const options = { resume: true, force: false };
    const pendingFundamentals = await Ticker.findAll({ where: selection.fundamentalWhere(options), raw: true });
    assert.deepEqual(pendingFundamentals.map(row => row.symbol).sort(), ['AAA', 'CCC']);
    const pendingTechnicals = await Ticker.findAll({ where: selection.technicalWhere(options), raw: true });
    assert.deepEqual(pendingTechnicals.map(row => row.symbol).sort(), ['AAA', 'CCC']);
    const sources = require('../services/stocks/stock-sources').createStockSources({
      ticker: Ticker, incomeStatement: IncomeStatement, sequelize,
      yahoo: { quoteSummary: async () => ({ price: { longName: 'Alpha refreshed' },
        financialData: { totalRevenue: 600, earningsGrowth: 0 }, defaultKeyStatistics: { trailingEps: 3 } }) },
      sec: { getCikMapping: async () => ({ AAA: '0000000001' }), fetchSecIncomeStatements: async () => [
        { fiscal_year: 2026, fiscal_period: 'Q1', revenue: 0, eps: 0, report_date: '2026-03-31' },
      ] },
    });
    await sources.fundamentals('AAA');
    await sources.financials('AAA');
    const refreshed = (await get('/AAA')).data;
    assert.equal(refreshed.company_name, 'Alpha refreshed');
    assert.equal(Number(refreshed.fundamentals.ttm_revenue), 600);
    assert.equal(refreshed.quarterly_history.length, 1);
    assert.equal(Number(refreshed.quarterly_history[0].revenue), 0);
    assert.equal((await get('/BBB')).data.company_name, 'Beta Technology');
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (pool) await pool.end();
    if (sequelize) await sequelize.close();
    if (created) await admin.query(`DROP DATABASE \`${database}\``);
    await admin.end();
    if (originalDatabase === undefined) delete process.env.DB_NAME;
    else process.env.DB_NAME = originalDatabase;
  }
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStockSources } = require('../services/stocks/stock-sources');

function setup() {
  const writes = [], rows = [];
  const dependencies = {
    now: () => Date.parse('2026-10-29T00:00:00Z'),
    yahoo: { quoteSummary: async (symbol, { modules }) => {
      assert.ok(modules.includes('summaryDetail'), 'P/E requires the Yahoo summaryDetail module');
      return ({
      price: { longName: 'Alpha', marketCap: 1000 }, assetProfile: { sector: 'Technology' },
      financialData: { financialCurrency: 'USD', earningsGrowth: 0, revenueGrowth: 0, targetMeanPrice: 120, totalRevenue: 500 },
      defaultKeyStatistics: { trailingEps: 0 }, summaryDetail: { trailingPE: 10 },
    }); }, fundamentalsTimeSeries: async () => [] },
    ticker: { update: async (values, options) => writes.push({ values, options }) },
    sequelize: { transaction: fn => fn('transaction') },
    incomeStatement: { bulkCreate: async (values, options) => rows.push({ values, options }), findAll: async ({ where }) => [
      { symbol: 'AAA', period_type: 'Annual', fiscal_year: 2025, fiscal_period: 'FY', revenue: '300', eps: 1, currency: 'USD', source_api: 'sec_edgar' },
      { symbol: 'AAA', period_type: 'Annual', fiscal_year: 2024, fiscal_period: 'FY', revenue: '200', eps: 1, currency: 'USD', source_api: 'sec_edgar' },
      { symbol: 'AAA', period_type: 'Quarterly', fiscal_year: 2026, fiscal_period: 'Q1', revenue: '25', eps: 0, currency: 'USD', source_api: 'sec_edgar' },
    ].filter(row => !where.period_type || row.period_type === where.period_type) },
    sec: { getCikMapping: async () => ({ AAA: '0000000001' }), fetchSecIncomeStatements: async () => [
      { fiscal_year: 2025, fiscal_period: 'FY', revenue: 0, net_income: 0, eps: 0, report_date: '2025-12-31' },
    ] },
  };
  return { dependencies, writes, rows, service: createStockSources(dependencies) };
}

test('Yahoo refresh preserves zero values and omits unavailable fields instead of erasing them', async () => {
  const s = setup();
  const forecast = await s.service.fundamentals('AAA');
  assert.equal(s.writes[0].values.ttm_eps, 0);
  assert.equal(s.writes[0].values.revenue_yoy_growth, 0);
  assert.equal(s.writes[0].values.pe_ratio, 10);
  assert.equal('description' in s.writes[0].values, false);
  assert.deepEqual(s.writes[0].options.where, { symbol: 'AAA' });
  assert.equal(forecast.data.target_price.mean, 120);
});

test('SEC upsert and successful checkpoint share one transaction and target one symbol', async () => {
  const s = setup();
  const result = await s.service.financials('AAA');
  assert.equal(result.status, 'updated');
  assert.equal(s.rows[0].values[0].symbol, 'AAA');
  assert.equal(s.rows[0].values[0].revenue, 0);
  assert.equal(s.rows[0].values[0].eps, 0);
  assert.equal(s.rows[0].options.transaction, 'transaction');
  assert.equal(s.writes[0].options.transaction, 'transaction');
  assert.equal(s.writes[0].values.revenue_consecutive_years, 1);
});

test('missing SEC mapping skips statements, while fetch failure never advances its checkpoint', async () => {
  const s = setup();
  assert.equal((await s.service.financials('BBB')).status, 'unavailable');
  assert.equal(s.writes.length, 0);
  const fail = setup();
  fail.dependencies.sec.fetchSecIncomeStatements = async () => { throw new Error('SEC failed'); };
  const result = await fail.service.financials('AAA');
  assert.equal(result.providers.sec_financials.status, 'failed');
  assert.equal(result.status, 'unavailable');
  assert.equal(fail.writes.length, 0);
});

test('missing history starts SEC and Yahoo immediately and saves Yahoo fallback in reported currency', async () => {
  const s = setup();
  let releaseSec;
  const secGate = new Promise(resolve => { releaseSec = resolve; });
  const requests = [];
  s.dependencies.incomeStatement.findAll = async () => [];
  s.dependencies.sec.fetchSecIncomeStatements = async () => { await secGate; return []; };
  s.dependencies.yahoo.quoteSummary = async () => ({ financialData: { financialCurrency: 'DKK' } });
  s.dependencies.yahoo.fundamentalsTimeSeries = async (symbol, { type }) => {
    requests.push([symbol, type]);
    return [{ date: new Date(type === 'annual' ? '2025-12-31' : '2026-03-31'), totalRevenue: 100, dilutedEPS: 0 }];
  };
  const request = createStockSources(s.dependencies).financials('AAA');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2, 'Yahoo starts without waiting for SEC');
  releaseSec();
  const result = await request;
  assert.equal(result.providers.sec_financials.status, 'unavailable');
  assert.equal(result.providers.yahoo_financials.status, 'updated');
  assert.equal(s.rows[0].values.length, 2);
  assert.equal(s.rows[0].values[0].currency, 'DKK');
  assert.equal(s.rows[0].values[0].source_api, 'yahoo_finance');
  assert.equal(s.rows[0].values[0].eps, 0);
  assert.equal('last_sec_update' in s.writes[0].values, false);
});

test('SEC failure cannot prevent Yahoo history saving, and full failure keeps saved rows intact', async () => {
  const s = setup();
  s.dependencies.incomeStatement.findAll = async () => [];
  s.dependencies.sec.getCikMapping = async () => { throw new Error('SEC failed'); };
  s.dependencies.yahoo.fundamentalsTimeSeries = async () => [{ date: new Date('2025-12-31'), totalRevenue: 100, dilutedEPS: 1 }];
  const result = await createStockSources(s.dependencies).financials('AAA');
  assert.equal(result.providers.yahoo_financials.status, 'updated');
  assert.equal(result.providers.sec_financials.status, 'failed');
  const broken = setup();
  broken.dependencies.sec.getCikMapping = async () => { throw new Error('SEC failed'); };
  broken.dependencies.yahoo.fundamentalsTimeSeries = async () => { throw new Error('Yahoo failed'); };
  await assert.rejects(createStockSources(broken.dependencies).financials('AAA'), /Both financial/);
  assert.equal(broken.rows.length, 0);
  assert.equal(broken.writes.length, 0);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { hasFinancialHistory, yahooStatements, mergeStatements } = require('../services/stocks/financial-history');

test('zero is saved data; missing periods or all-null EPS still need both providers', () => {
  assert.equal(hasFinancialHistory({ annual: [{ revenue: 0, eps: 0 }], quarterly: [{ revenue: 1, eps: -1 }] }), true);
  assert.equal(hasFinancialHistory({ annual: [{ revenue: 1, eps: null }], quarterly: [{ revenue: 1, eps: 1 }] }), false);
  assert.equal(hasFinancialHistory({ annual: [{ revenue: 1, eps: 1 }], quarterly: [] }), false);
});

test('Yahoo preserves reported DKK, zero EPS and fiscal quarters for a non-calendar year', () => {
  const rows = yahooStatements('AAA', [{ date: new Date('2025-06-30'), totalRevenue: 100, dilutedEPS: 0 }],
    [{ date: new Date('2025-09-30'), totalRevenue: 20, basicEPS: -1 }], 'DKK', 2020);
  assert.equal(rows[0].currency, 'DKK');
  assert.equal(rows[0].eps, 0);
  assert.equal(rows[1].fiscal_year, 2026);
  assert.equal(rows[1].fiscal_period, 'Q1');
  assert.throws(() => yahooStatements('AAA', [], [], undefined, 2020), /currency/);
  const weekly = yahooStatements('AAA', [{ date: new Date('2026-01-31'), totalRevenue: 100 }],
    [{ date: new Date('2025-05-03'), periodType: '3M', totalRevenue: 25 }], 'USD', 2020);
  assert.equal(weekly[1].fiscal_period, 'Q1');
  assert.equal(weekly[1].fiscal_year, 2026);
});

test('SEC has priority and null incoming values never erase saved amounts', () => {
  const saved = { symbol: 'AAA', period_type: 'Annual', fiscal_year: 2025, fiscal_period: 'FY', revenue: 100, eps: 1, currency: 'USD', source_api: 'sec_edgar' };
  const yahoo = { ...saved, source_api: 'yahoo_finance', revenue: 200, eps: 2 };
  assert.equal(mergeStatements([saved], [yahoo])[0].revenue, 100);
  assert.deepEqual(mergeStatements([saved], [{ ...yahoo, currency: 'DKK' }]), []);
  assert.equal(mergeStatements([saved], [{ ...saved, revenue: null, eps: 0 }])[0].revenue, 100);
  assert.equal(mergeStatements([yahoo], [saved])[0].source_api, 'sec_edgar');
});

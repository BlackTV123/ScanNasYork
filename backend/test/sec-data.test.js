const test = require('node:test');
const assert = require('node:assert/strict');
const { createSecClient, parseSecFacts } = require('../services/stocks/sec-data');

test('SEC queue separates request starts and shares the public mapping', async () => {
  let time = 0;
  const starts = [];
  const client = createSecClient({ now: () => time, pause: async ms => { time += ms; },
    fetchFn: async url => { starts.push(time); return { ok: true, json: async () => url.endsWith('company_tickers.json')
      ? { 0: { ticker: 'AAA', cik_str: 1 } } : { facts: {} } }; },
  });
  const [a, b] = await Promise.all([client.getCikMapping(), client.getCikMapping()]);
  assert.equal(a, b);
  assert.equal(a.AAA, '0000000001');
  await Promise.all([client.fetchSecIncomeStatements(a.AAA), client.fetchSecIncomeStatements(a.AAA)]);
  assert.deepEqual(starts, [0, 150, 300]);
  await client.getCikMapping();
  assert.equal(starts.length, 3);
});

test('failed SEC requests release the queue and do not populate the mapping cache', async () => {
  let calls = 0;
  const client = createSecClient({ pause: async () => {}, fetchFn: async () => ({
    ok: ++calls > 1, status: 503, json: async () => ({ 0: { ticker: 'AAA', cik_str: 1 } }),
  }) });
  await assert.rejects(client.getCikMapping(), /503/);
  assert.equal((await client.getCikMapping()).AAA, '0000000001');
});

test('shared SEC parser extracts annual revenue and EPS facts', () => {
  const fact = value => ({ start: '2025-01-01', end: '2025-12-31', fy: 2025, fp: 'FY', filed: '2026-01-30', val: value });
  const rows = parseSecFacts({ facts: { 'us-gaap': {
    Revenues: { units: { USD: [fact(1000)] } },
    NetIncomeLoss: { units: { USD: [fact(100)] } },
    EarningsPerShareDiluted: { units: { 'USD/shares': [fact(2)] } },
  } } });
  assert.equal(rows[0].fiscal_period, 'FY');
  assert.equal(rows[0].revenue, 1000);
  assert.equal(rows[0].eps, 2);
});

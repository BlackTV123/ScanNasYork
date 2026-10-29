const test = require('node:test');
const assert = require('node:assert/strict');
const { createStockSnapshotService } = require('../services/stocks/stock-snapshot');

function setup() {
  let time = 0;
  const calls = [];
  const dependencies = {
    now: () => time,
    exists: async symbol => symbol !== 'MISSING',
    chart: async symbol => { calls.push(['chart', symbol]); return { success: true, price_snapshot: { price: 112 } }; },
    fundamentals: async symbol => { calls.push(['yahoo', symbol]); return { success: true, data: { target_price: { mean: 120 } } }; },
    financials: async symbol => { calls.push(['sec', symbol]); return { status: 'updated' }; },
    readDetail: async symbol => ({ success: true, data: { symbol, is_favorite: false } }),
    readFinancials: async () => ({ success: true, data: {
      annual: [{ revenue: 100, eps: 1 }], quarterly: [{ revenue: 25, eps: 0 }],
    } }),
  };
  const service = createStockSnapshotService(dependencies);
  return { calls, service, dependencies, advance: ms => time += ms };
}

test('all sources refresh only the selected symbol, and are shared for exactly one minute', async () => {
  const s = setup();
  const first = await s.service.get('AAA');
  assert.deepEqual(s.calls, [['chart', 'AAA'], ['yahoo', 'AAA'], ['sec', 'AAA']]);
  s.advance(59999);
  assert.equal(await s.service.get('AAA'), first);
  assert.equal(s.calls.length, 3);
  await s.service.get('BBB');
  assert.deepEqual(s.calls.slice(3), [['chart', 'BBB'], ['yahoo', 'BBB'], ['sec', 'BBB']]);
  s.advance(1);
  await s.service.get('AAA');
  assert.equal(s.calls.length, 9);
});

test('concurrent opens share one refresh, and favorite changes do not trigger another fetch', async () => {
  const s = setup();
  const [a, b] = await Promise.all([s.service.get('AAA'), s.service.get('AAA')]);
  assert.equal(a, b);
  assert.equal(s.calls.length, 3);
  s.service.updateFavorite('AAA', true);
  assert.equal((await s.service.get('AAA')).detail.data.is_favorite, true);
  assert.equal(s.calls.length, 3);
});

test('partial failures preserve database fallback and report stale sources without request storms', async () => {
  const calls = [];
  const service = createStockSnapshotService({
    exists: async () => true, now: () => 0,
    chart: async () => ({ success: true }),
    fundamentals: async () => ({ success: true }),
    financials: async () => { calls.push('sec'); throw new Error('SEC unavailable'); },
    readDetail: async () => ({ success: true, data: { symbol: 'AAA' } }),
    readFinancials: async () => ({ success: true, data: {
      annual: [{ fiscal_year: 2025, revenue: 100, eps: 1 }], quarterly: [{ revenue: 25, eps: 0 }],
    } }),
  });
  const result = await service.get('AAA');
  assert.equal(result.sources.sec_financials.status, 'failed');
  assert.equal(result.sources.price_chart.status, 'updated');
  assert.equal(result.financials.data.annual.length, 1);
  assert.equal(result.warnings.length, 1);
  await service.get('AAA');
  assert.equal(calls.length, 1);
});

test('unknown stock fails without querying any upstream provider', async () => {
  const s = setup();
  await assert.rejects(s.service.get('MISSING'), { status: 404 });
  assert.deepEqual(s.calls, []);
});

test('all upstream sources failing still returns saved annual and quarterly MySQL history', async () => {
  const s = setup();
  for (const source of ['chart', 'fundamentals', 'financials']) {
    s.dependencies[source] = async () => { throw new Error('Network unavailable'); };
  }
  const saved = { success: true, data: {
    annual: [{ period: '2025', revenue: 100, eps: 0 }],
    quarterly: [{ period: 'Q1 2026', revenue: 25, eps: -0.5 }],
  } };
  s.dependencies.readFinancials = async () => saved;
  const result = await createStockSnapshotService(s.dependencies).get('AAA');
  assert.equal(result.financials, saved);
  assert.equal(result.warnings.length, 3);
  assert.equal(result.detail.success, true);
});

test('financial database read failure does not hide a successful chart refresh', async () => {
  const service = createStockSnapshotService({
    exists: async () => true,
    chart: async () => ({ success: true, price_snapshot: { price: 112 } }),
    fundamentals: async () => ({ success: true }), financials: async () => ({ status: 'updated' }),
    readDetail: async () => ({ success: true, data: { symbol: 'AAA' } }),
    readFinancials: async () => { throw new Error('Read failed'); },
  });
  const result = await service.get('AAA');
  assert.equal(result.chart.price_snapshot.price, 112);
  assert.equal(result.financials.success, false);
  assert.match(result.warnings[0], /saved_financials/);
});

test('missing financial history retries immediately but reuses price/company cache and coalesces opens', async () => {
  const s = setup();
  let ready = false;
  s.dependencies.readFinancials = async () => ({ success: true, data: ready ? {
    annual: [{ revenue: 100, eps: 1 }], quarterly: [{ revenue: 25, eps: 0 }],
  } : { annual: [], quarterly: [] } });
  const service = createStockSnapshotService(s.dependencies);
  await service.get('AAA');
  s.advance(1000);
  ready = true;
  const [a, b] = await Promise.all([service.get('AAA'), service.get('AAA')]);
  assert.equal(a, b);
  assert.deepEqual(s.calls.map(call => call[0]), ['chart', 'yahoo', 'sec', 'sec']);
  await service.get('AAA');
  assert.equal(s.calls.length, 4);
  s.advance(59000);
  await service.get('AAA');
  assert.equal(s.calls.length, 7, 'financial retry does not reset the original minute');
});

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChartDataService } = require('../services/stocks/chart-data');

function setup() {
  let time = 100000;
  let price = 110;
  let requests = 0;
  let invalidations = 0;
  let failed = false;
  const writes = [];
  const yahoo = {
    chart: async () => {
      requests++;
      if (failed) throw new Error('Yahoo unavailable');
      return { quotes: [
        { date: new Date('2026-01-02'), open: 95, high: 105, low: 90, close: 100, volume: 10 },
        { date: new Date('2026-01-03'), open: 100, high: 120, low: 99, close: price, volume: 20 },
      ] };
    },
    quote: async () => ({ regularMarketPreviousClose: 100, regularMarketPrice: 999 }),
  };
  const service = createChartDataService({ yahoo, now: () => time,
    ticker: { update: async (data, options) => writes.push({ data, options }) },
    onPriceUpdated: () => invalidations++,
  });
  return { service, yahoo, writes, advance: ms => time += ms, setPrice: p => price = p,
    fail: value => failed = value, requests: () => requests, invalidations: () => invalidations };
}

test('header price, last candle and saved price are one snapshot, without marking indicators fresh', async () => {
  const s = setup();
  const result = await s.service.get('AAA', '1d', '1d', { refresh: true });
  assert.equal(result.price_snapshot.price, result.data.at(-1).close);
  assert.equal(result.price_snapshot.price, 110); // Ignore the unrelated quote's current price.
  assert.equal(result.price_snapshot.price_change_pct, 10);
  assert.deepEqual(s.writes[0], { data: { current_price: 110, price_change_pct: 10 }, options: { where: { symbol: 'AAA' } } });
  assert.equal(s.invalidations(), 1);
});

test('opening with refresh bypasses cached data; ordinary reads expire after 60 seconds', async () => {
  const s = setup();
  await s.service.get('AAA', '1d', '1d');
  s.setPrice(115);
  s.advance(59999);
  assert.equal((await s.service.get('AAA', '1d', '1d')).price_snapshot.price, 110);
  assert.equal(s.requests(), 1);
  assert.equal((await s.service.get('AAA', '1d', '1d', { refresh: true })).price_snapshot.price, 115);
  s.advance(60000);
  s.setPrice(118);
  assert.equal((await s.service.get('AAA', '1d', '1d')).price_snapshot.price, 118);
  assert.equal(s.requests(), 3);
});

test('simultaneous refreshes share the same upstream request', async () => {
  const s = setup();
  await Promise.all([s.service.get('AAA', '1d', '1d', { refresh: true }), s.service.get('AAA', '1d', '1d', { refresh: true })]);
  assert.equal(s.requests(), 1);
  assert.equal(s.writes.length, 1);
});

test('failed refresh does not write a price or poison future requests', async () => {
  const s = setup();
  await s.service.get('AAA', '1d', '1d');
  s.fail(true);
  await assert.rejects(s.service.get('AAA', '1d', '1d', { refresh: true }), /Yahoo unavailable/);
  assert.equal(s.writes.length, 1);
  s.fail(false);
  s.setPrice(120);
  assert.equal((await s.service.get('AAA', '1d', '1d', { refresh: true })).price_snapshot.price, 120);
});

test('quote failure still returns a consistent chart price and daily-change fallback', async () => {
  const s = setup();
  s.yahoo.quote = async () => { throw new Error('Quote unavailable'); };
  const result = await s.service.get('AAA', '1d', '1d');
  assert.equal(result.price_snapshot.price, 110);
  assert.equal(result.price_snapshot.price_change_pct, 10);
  const weekly = await s.service.get('AAA', '1w', '1wk');
  assert.equal(weekly.price_snapshot.price, weekly.data.at(-1).close);
  assert.equal(weekly.price_snapshot.price_change_pct, null);
});

test('invalid candles cannot replace a valid database price', async () => {
  const s = setup();
  s.yahoo.chart = async () => ({ quotes: [{ close: null, date: new Date() }] });
  await assert.rejects(s.service.get('AAA', '1d', '1d'), { status: 404 });
  assert.equal(s.writes.length, 0);
});

test('on-demand daily charts recalculate indicators and volume for only that symbol', async () => {
  const writes = [];
  const service = createChartDataService({
    yahoo: { chart: async () => ({ quotes: [{ date: new Date('2026-01-03'), open: 100, high: 120, low: 99, close: 112, volume: 500 }] }), quote: async () => ({ regularMarketPreviousClose: 100 }) },
    ticker: { update: async (values, options) => writes.push({ values, options }) },
    calculateIndicators: () => ({ rsi_14: 55, macd: 2 }), now: () => 100000,
  });
  await service.get('AAA', '1d', '1d');
  assert.equal(writes[0].values.current_price, 112);
  assert.equal(writes[0].values.rsi_14, 55);
  assert.equal(writes[0].values.volume, 500);
  assert.equal(writes[0].values.last_technical_update.getTime(), 100000);
  assert.deepEqual(writes[0].options.where, { symbol: 'AAA' });
});

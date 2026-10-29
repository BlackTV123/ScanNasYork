const test = require('node:test');
const assert = require('node:assert/strict');
const { createForexService } = require('../services/markets/market-data');
const { createMarketCache } = require('../services/markets/market-cache');
const { parseFredCsv, macroObservation, createMacroService } = require('../services/markets/macro-data');

test('Forex header price matches its final candle, preserves precision and deduplicates dates', async () => {
  const calls = [];
  const service = createForexService({ now: () => Date.parse('2026-10-29T12:00:00Z'), yahoo: {
    chart: async (symbol, query) => { calls.push(symbol); return { quotes: [
      { date: new Date('2026-10-28T00:00:00Z'), open: 1.1, high: 1.2, low: 1.0, close: 1.12345 },
      { date: new Date('2026-10-28T12:00:00Z'), open: 1.1, high: 1.2, low: 1.0, close: 1.12349 },
    ] }; }, quote: async () => ({ regularMarketPrice: 999, regularMarketPreviousClose: 1.1 }),
  } });
  const result = await service.get('eurusd', '1d');
  assert.equal(result.data.length, 1);
  assert.equal(result.market.price, result.data.at(-1).close);
  assert.equal(result.market.price, 1.12349);
  assert.equal(result.instrument.unit, 'USD per EUR');
  assert.equal((await service.get('eurusd', '1d')).cached, true);
  assert.equal(calls.length, 1);
  await assert.rejects(service.get('http://untrusted.test', '1h'), /Unknown instrument/);
  await assert.rejects(service.get('eurusd', 'invalid'), /Unknown instrument/);
  await assert.rejects(service.get('eurusd', 'constructor'), /Unknown instrument/);
  await assert.rejects(service.get('eurusd', ['1h']), /Unknown instrument/);
  await assert.rejects(service.get('eurusd', '1y'), /Unknown instrument/);
  assert.equal(calls.length, 1);
});

test('5m timeframe preserves multiple sessions in its automatic history and does not require quotes', async () => {
  const service = createForexService({ yahoo: {
    chart: async () => ({ quotes: [
      { date: new Date('2026-10-23T09:00:00Z'), open: 100, high: 101, low: 99, close: 100 },
      { date: new Date('2026-10-26T09:00:00Z'), open: 100, high: 101, low: 99, close: 101 },
      { date: new Date('2026-10-26T10:00:00Z'), open: null, high: 101, low: 99, close: 101 },
    ] }), quote: async () => { throw Error('Quote failed'); },
  } });
  const result = await service.get('gold', '5m');
  assert.equal(result.data.length, 2);
  assert.equal(typeof result.data[0].time, 'number');
  assert.equal(result.market.change_pct, null);
  assert.equal(result.market.price, 101);
});

test('4H aggregates deduplicated hourly OHLC into UTC buckets, preserves gaps and marks a live partial candle', async () => {
  const date = time => new Date(`2026-10-29T${time}:00Z`);
  const calls = [];
  const service = createForexService({ now: () => date('13:30').getTime(), yahoo: {
    chart: async (symbol, options) => { calls.push(options); return { quotes: [
      { date: date('03:00'), open: 13, high: 16, low: 12, close: 15 },
      { date: date('00:00'), open: 10, high: 12, low: 9, close: 11 },
      { date: date('01:00'), open: 11, high: 14, low: 10, close: 12 },
      { date: date('02:00'), open: 12, high: 15, low: 8, close: 13 },
      { date: date('12:00'), open: 20, high: 23, low: 19, close: 22 },
      { date: date('13:00'), open: 22, high: 24, low: 21, close: 23 },
      { date: date('13:00'), open: 22, high: 25, low: 21, close: 24 },
    ] }; }, quote: async () => null,
  } });
  const result = await service.get('gold', '4h');
  assert.equal(calls[0].interval, '1h');
  assert.equal(calls[0].period1.getUTCHours() % 4, 0);
  assert.deepEqual(result.data, [
    { time: date('00:00').getTime() / 1000, open: 10, high: 16, low: 8, close: 15 },
    { time: date('12:00').getTime() / 1000, open: 20, high: 25, low: 19, close: 24 },
  ]);
  assert.equal(result.market.price, 24);
  assert.equal(result.market.as_of, date('13:00').toISOString());
  assert.equal(result.aggregation.last_source_count, 2);
  assert.equal(result.aggregation.last_complete, false);
  assert.equal(result.source_interval, '1h');
  assert.equal(result.time_zone, 'UTC');
  assert.equal(result.market.change_pct, null);
});

test('timeframe switches fetch the requested source interval and use independent one-minute caches', async () => {
  let calls = [], time = Date.parse('2026-10-29T12:00:00Z');
  const service = createForexService({ now: () => time, yahoo: {
    chart: async (symbol, options) => { calls.push(options); return { quotes: [{ date: new Date('2026-10-28T00:00:00Z'), open: 10, high: 12, low: 9, close: 11 }] }; }, quote: async () => null,
  } });
  for (const timeframe of ['5m', '15m', '30m', '1h', '4h', '1d', '1wk']) {
    const result = await service.get('gold', timeframe);
    assert.equal(result.timeframe, timeframe);
    assert.equal(result.interval, timeframe);
    assert.equal(typeof result.data[0].time, ['1d', '1wk'].includes(timeframe) ? 'string' : 'number');
    assert.equal(result.coverage.to, result.data.at(-1).time);
    assert.equal(result.market.price, result.data.at(-1).close);
    assert.equal((await service.get('gold', timeframe)).cached, true);
  }
  assert.deepEqual(calls.map(c => c.interval), ['5m', '15m', '30m', '1h', '1h', '1d', '1wk']);
  assert.deepEqual(calls.map(c => Math.round((time - c.period1) / 86400000)), [7, 14, 31, 59, 180, 730, 1826]);
  time += 60000;
  await service.get('gold', '15m');
  assert.equal(calls.length, 8);
});

test('daily and weekly labels use the source session timezone; weekly close never masquerades as previous daily close', async () => {
  const service = createForexService({ yahoo: {
    chart: async () => ({ meta: { exchangeTimezoneName: 'Asia/Tokyo' }, quotes: [
      { date: new Date('2026-10-25T15:00:00Z'), open: 10, high: 12, low: 9, close: 11 },
      { date: new Date('2026-10-26T15:00:00Z'), open: 11, high: 13, low: 10, close: 12 },
    ] }), quote: async () => { throw Error('Offline'); },
  } });
  const daily = await service.get('gold', '1d');
  assert.deepEqual(daily.data.map(c => c.time), ['2026-10-26', '2026-10-27']);
  assert.equal(daily.market.previous_close, 11);
  const weekly = await service.get('gold', '1wk');
  assert.equal(weekly.market.previous_close, null);
  assert.equal(weekly.market.change_pct, null);
});

test('Yahoo appended live rows update their existing intraday/weekly candle without erasing OHLC', async () => {
  const service = createForexService({ yahoo: {
    chart: async () => ({ meta: { exchangeTimezoneName: 'America/New_York' }, quotes: [
      { date: new Date('2026-10-26T04:00:00Z'), open: 100, high: 120, low: 90, close: 110 },
      { date: new Date('2026-10-29T15:00:00Z'), open: 112, high: 118, low: 108, close: 114 },
      { date: new Date('2026-10-29T15:10:17Z'), open: 115, high: 115, low: 115, close: 115 },
    ] }), quote: async () => null,
  } });
  const hourly = await service.get('gold', '1h');
  assert.equal(hourly.data.length, 2);
  assert.deepEqual(hourly.data.at(-1), { time: Date.parse('2026-10-29T15:00:00Z') / 1000, open: 112, high: 118, low: 108, close: 115 });
  const weekly = await service.get('gold', '1wk');
  assert.deepEqual(weekly.data, [{ time: '2026-10-26', open: 100, high: 120, low: 90, close: 115 }]);
  assert.equal(weekly.market.price, 115);
  assert.equal(weekly.market.as_of, '2026-10-29T15:10:17.000Z');
});

test('market cache coalesces requests, marks stale fallback and backs off failed refreshes', async () => {
  let time = 0, calls = 0, fail = false;
  const cache = createMarketCache(60000, { now: () => time });
  const load = async () => { calls++; if (fail) throw Error('Offline'); return { price: 100 }; };
  const [a, b] = await Promise.all([cache.get('a', load), cache.get('a', load)]);
  assert.equal(a, b); assert.equal(calls, 1);
  time = 60000; fail = true;
  assert.equal((await cache.get('a', load)).stale, true);
  await cache.get('a', load); assert.equal(calls, 2);
  time += 30000; fail = false;
  assert.equal((await cache.get('a', load)).stale, false);
  assert.equal(calls, 3);
});

test('FRED rejects HTML, skips missing values and computes CPI against the exact prior-year month', () => {
  const rows = parseFredCsv('observation_date,CPIAUCSL\n2025-09-01,100\n2025-10-01,101\n2026-08-01,.\n2026-09-01,103\n2026-10-01,', 'CPIAUCSL');
  const result = macroObservation({ id: 'CPIAUCSL', derived: true }, rows);
  assert.ok(Math.abs(result.value - 3) < 1e-9);
  assert.equal(result.observation_date, '2026-09-01');
  assert.throws(() => parseFredCsv('<html>Unavailable</html>', 'DFF'), /Unexpected/);
  assert.throws(() => macroObservation({ id: 'CPIAUCSL', derived: true }, [{ date: '2026-09-01', value: 103 }]), /Previous-year/);
});

test('one missing macro series cannot hide the others; observations are cached independently', async () => {
  let calls = 0;
  const service = createMacroService({ fetchFn: async url => {
    calls++; const id = new URL(url).searchParams.get('id');
    if (id === 'DGS10') throw Error('Unavailable');
    return { ok: true, text: async () => `observation_date,${id}\n2025-09-01,100\n2026-09-01,103` };
  } });
  const result = await service.get();
  assert.equal(result.data.filter(item => item.status === 'unavailable').length, 1);
  assert.equal(result.data.find(item => item.id === 'CPIAUCSL').status, 'available');
  await service.get(); assert.equal(calls, 5);
});

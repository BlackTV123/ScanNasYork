const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDataset, parseCoreCpi, observation, createCountryEconomics: createService, TTL, PAIRS } = require('../services/markets/country-economics');
const { snapshot } = require('../services/markets/core-inflation');
const createCountryEconomics = options => createService({ foreignCoreLoader: async country => snapshot(country, [{ period: '2026-09', yoy: 2, mom: null }]), ...options });
const stamp = '2026-10-29T12:00:00.000Z';
const csv = (dataset, codes = ['US', 'CA']) => dataset === 'policy'
  ? 'FREQ,REF_AREA,UNIT_MEASURE,UNIT_MULT,COMPILATION,SOURCE_REF,TIME_PERIOD,OBS_VALUE\n' + codes.map(code => `D,${code},368,0,"Target, midpoint\nnot effective",Central bank,2026-10-27,3.875`).join('\n')
  : 'FREQ,REF_AREA,UNIT_MEASURE,UNIT_MULT,TIME_PERIOD,OBS_VALUE\n' + codes.flatMap(code => [`M,${code},628,0,2025-09,100`, `M,${code},628,0,2026-08,102`, `M,${code},628,0,2026-09,103`, `M,${code},771,0,2026-09,999`]).join('\n');
const fredCsv = id => `observation_date,${id}\n2025-09-01,100\n2026-08-01,102\n2026-09-01,${id === 'CPILFENS' ? 104 : 103}`;
const fetcher = calls => async url => { const id = new URL(url).searchParams.get('id'); const dataset = url.includes('WS_CBPOL') ? 'policy' : 'cpi'; calls.push(id || dataset); return { ok: true, text: async () => id ? fredCsv(id) : csv(dataset) }; };

test('SDMX CSV keeps quoted multiline definitions and rejects wrong units or missing values', () => {
  const items = parseDataset(csv('policy'), 'policy', stamp);
  assert.equal(items.length, 2);
  assert.equal(items[0].definition, 'Target, midpoint\nnot effective');
  assert.equal(parseDataset(csv('cpi'), 'cpi', stamp)[0].rows.at(-1).value, 103);
  assert.throws(() => parseDataset('<html>Unavailable</html>', 'policy', stamp), /Unexpected/);
  assert.equal(parseDataset(csv('policy').replaceAll(',3.875', ','), 'policy', stamp).length, 0);
});
test('inflation uses exact comparison months; Australian interpolated series never claims a MoM release', () => {
  const item = parseDataset(csv('cpi'), 'cpi', stamp)[0];
  let o = observation(item, Date.parse(stamp));
  assert.ok(Math.abs(o.yoy - 3) < 1e-8);
  assert.ok(Math.abs(o.mom - (103 / 102 - 1) * 100) < 1e-8);
  assert.equal(observation({ ...item, country: 'AU' }, Date.parse(stamp)).mom, null);
  o = observation({ ...item, rows: item.rows.filter(row => row.period !== '2026-08') }, Date.parse(stamp));
  assert.equal(o.mom, null);
  assert.equal(observation(item, Date.parse(stamp) + TTL).status, 'stale');
});
test('policy previous value is the prior distinct rate, not yesterday’s unchanged rate', () => {
  const item = parseDataset(csv('policy'), 'policy', stamp)[0];
  item.rows = [{ period: '2026-10-01', value: 4 }, { period: '2026-10-02', value: 3.875 }, { period: '2026-10-03', value: 3.875 }];
  const o = observation(item, Date.parse(stamp));
  assert.equal(o.previous, 4); assert.equal(o.last_change_period, '2026-10-02');
});
test('cold requests coalesce, persist independently, validate instruments and reuse fresh SQL after restart', async () => {
  const calls = [], saved = new Map();
  const store = { load: async d => saved.get(d) || [], save: async (d, items) => saved.set(d, [...new Map([...(saved.get(d) || []), ...items].map(item => [item.id, item])).values()]) };
  const service = createCountryEconomics({ now: () => Date.parse(stamp), store, fetchFn: fetcher(calls) });
  const [a, b] = await Promise.all([service.get('usdcad'), service.get('usdcad')]);
  assert.deepEqual(a.countries.map(c => c.code), ['US', 'CA']);
  assert.equal(b.countries[1].cpi.status, 'available');
  assert.equal(a.persistence, 'mysql'); assert.equal(calls.length, 4);
  assert.equal(a.countries[0].core_cpi.status, 'available');
  assert.equal(a.countries[1].core_cpi.name, 'CPI-trim');
  const restarted = createCountryEconomics({ now: () => Date.parse(stamp), store, fetchFn: async () => { throw Error('must not fetch'); } });
  assert.equal((await restarted.get('usdcad')).countries[1].policy.value, 3.875);
  await assert.rejects(service.get('constructor'), /Unknown/);
  assert.deepEqual(PAIRS.usddkk, ['US', 'DK']);
});
test('expired SQL remains visible during failed background refresh and retry backoff', async () => {
  let calls = 0;
  const store = { load: async d => d === 'core_cpi' ? [parseCoreCpi(fredCsv('CPILFESL'), fredCsv('CPILFENS'), stamp)] : parseDataset(csv(d), d, stamp), save: async () => assert.fail('failed refresh cannot save') };
  const service = createCountryEconomics({ now: () => Date.parse(stamp) + TTL + 1, store, fetchFn: async () => { calls++; throw Error('offline'); } });
  const a = await service.get('usdcad');
  assert.equal(a.countries[0].policy.status, 'stale');
  assert.equal(a.countries[1].cpi.value, 103);
  await service.refresh();
  await service.get('usdcad'); assert.equal(calls, 4);
  assert.equal(a.countries[0].core_cpi.status, 'stale');
});
test('US core CPI uses NSA for YoY, SA for MoM, and never substitutes a different observation month', () => {
  const item = parseCoreCpi(fredCsv('CPILFESL'), fredCsv('CPILFENS'), stamp);
  const actual = observation(item, Date.parse(stamp));
  assert.ok(Math.abs(actual.yoy - 4) < 1e-8);
  assert.ok(Math.abs(actual.mom - (103 / 102 - 1) * 100) < 1e-8);
  assert.equal(actual.period, '2026-09');
  assert.equal(observation({ ...item, annual_rows: item.annual_rows.slice(0, -1) }, Date.parse(stamp)).yoy, null);
  assert.throws(() => parseCoreCpi('<html>Offline</html>', fredCsv('CPILFENS'), stamp), /Unexpected/);
});
test('unavailable core CPI cannot hide saved policy or headline CPI', async () => {
  const service = createCountryEconomics({ now: () => Date.parse(stamp), store: { load: async d => d === 'core_cpi' ? [] : parseDataset(csv(d), d, stamp), save: async () => {} }, fetchFn: async () => { throw Error('FRED offline'); } });
  const result = await service.get('usdcad');
  assert.equal(result.countries[0].core_cpi.status, 'unavailable');
  assert.equal(result.countries[0].cpi.status, 'available');
  assert.equal(result.countries[0].policy.status, 'available');
});
test('one failed dataset cannot hide the other, and storage failure is disclosed', async () => {
  const service = createCountryEconomics({ now: () => Date.parse(stamp), store: { load: async () => [], save: async () => { throw Error('DB offline'); } },
    fetchFn: async url => { if (url.includes('WS_CBPOL')) throw Error('offline'); return { ok: true, text: async () => csv('cpi') }; } });
  const a = await service.get('usdcad');
  assert.equal(a.countries[0].policy.status, 'unavailable');
  assert.equal(a.countries[1].cpi.status, 'available');
  assert.equal(a.persistence, 'unavailable');
});

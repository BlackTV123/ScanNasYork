const test = require('node:test');
const assert = require('node:assert/strict');
const { CATALOG, fromIndex, parseOns, joinRates, parseCanada, parseAbs, parseDenmark, parseJapan, parseThailand, parseEurostat, snapshot, coreObservation } = require('../services/markets/core-inflation');
const { createCountryEconomics, TTL } = require('../services/markets/country-economics');

test('all nine countries have distinct named core definitions and adjustment metadata', () => {
  assert.equal(Object.keys(CATALOG).length, 9);
  assert.match(CATALOG.JP.definition, /retains energy/);
  assert.match(CATALOG.CH.definition, /NOT FSO/);
  assert.match(CATALOG.CA.definition, /20%/);
  assert.equal(CATALOG.CA.mom_adjustment, null);
});
test('index conversion requires exact comparison periods and does not turn missing values into zeros', () => {
  const rows = fromIndex([{ period: '2025-09', value: 100 }, { period: '2026-07', value: 101 }, { period: '2026-09', value: 103 }]);
  assert.ok(Math.abs(rows.at(-1).yoy - 3) < 1e-9);
  assert.equal(rows.at(-1).mom, null);
  assert.deepEqual(joinRates([{ period: '2026-09', value: 3 }], [{ period: '2026-08', value: .2 }]), [{ period: '2026-09', yoy: 3, mom: null }]);
});
test('ONS checks the series ID, uses published monthly observations and ignores annual/quarterly averages', () => {
  const text = '"Title","Core CPI"\n"CDID","DKO8"\n"2026","2.9"\n"2026 Q3","2.8"\n"2026 SEP","2.8"\n"2026 AUG",""';
  assert.deepEqual(parseOns(text, 'DKO8'), [{ period: '2026-09', value: 2.8 }]);
  assert.throws(() => parseOns(text, 'DKI7'), /Unexpected/);
});
test('Canada published YoY is kept as a rate; no MoM is fabricated from annual percentages', () => {
  const json = { seriesDetail: { CPI_TRIM: {} }, observations: [{ d: '2026-08-01', CPI_TRIM: { v: '1.9' } }, { d: '2026-09-01', CPI_TRIM: { v: '1.8' } }, { d: '2026-10-01', CPI_TRIM: { v: '' } }] };
  assert.deepEqual(parseCanada(json, 'CPI_TRIM').at(-1), { period: '2026-09', yoy: 1.8, mom: null });
  assert.throws(() => parseCanada(json, 'CPI_MEDIAN'), /Unexpected/);
});
test('ABS filters monthly national SA measures; quarterly and index values cannot become MoM rates', () => {
  const text = 'MEASURE,INDEX,TSEST,REGION,FREQ,TIME_PERIOD,OBS_VALUE,UNIT_MEASURE\n3,999902,20,50,M,2026-09,3.6,PCT\n2,999902,20,50,M,2026-09,0.3,PCT\n2,999902,20,50,Q,2026-Q3,9,PCT\n1,999902,20,50,M,2026-09,120,IN\n3,999903,20,50,M,2026-09,3.4,PCT';
  assert.deepEqual(parseAbs(text, '999902'), [{ period: '2026-09', yoy: 3.6, mom: .3 }]);
  assert.equal(parseAbs(text, '999903')[0].yoy, 3.4);
});
test('Denmark selects the national core aggregate and rate units, retaining zero and negative rates', () => {
  const text = 'VAREGR;ENHED;TID;INDHOLD\n151;300;2026M09;1.9\n151;200;2026M09;-0.3\n151;300;2026M08;0\n151;100;2026M09;101.2\n161;300;2026M09;99';
  assert.deepEqual(parseDenmark(text), [{ period: '2026-08', yoy: 0, mom: null }, { period: '2026-09', yoy: 1.9, mom: -.3 }]);
});
test('Japan distinguishes fresh-food-only exclusion from the fresh-food-and-energy variant', () => {
  const text = 'Group/Item,"All items, less fresh food","All items, less fresh food and energy"\n202509,100,100\n202608,102,103\n202609,102.1,104';
  const core = parseJapan(text, 'All items, less fresh food');
  const alt = parseJapan(text, 'All items, less fresh food and energy');
  assert.ok(Math.abs(core.at(-1).yoy - 2.1) < 1e-8);
  assert.ok(Math.abs(alt.at(-1).yoy - 4) < 1e-8);
  assert.throws(() => parseJapan(text, 'All items'), /Unexpected/);
});
test('Thailand checks national region, core-series ID and base; blank values are never zeros', () => {
  const base = { index_id: '0000000000093000', region_id: 5, base_year: 2023, year: 2026, month: 9, yoy: 1.5, mon: .01 };
  assert.deepEqual(parseThailand([base, { ...base, region_id: 1, yoy: 99 }, { ...base, base_year: 2019, yoy: 88 }, { ...base, month: 10, yoy: '', mon: null }]), [{ period: '2026-09', yoy: 1.5, mom: .01 }]);
});
test('Eurostat JSON-stat follows declared dimension order and rejects archived classification or wrong country', () => {
  const category = index => ({ category: { index } });
  const json = { source: 'ESTAT', id: ['freq', 'unit', 'coicop18', 'geo', 'time'], size: [1, 2, 1, 1, 2],
    dimension: { freq: category({ M: 0 }), unit: category({ RCH_M: 0, RCH_A: 1 }), coicop18: category({ TOT_X_NRG_FOOD: 0 }), geo: category({ CH: 0 }), time: category({ '2026-08': 0, '2026-09': 1 }) }, value: { 0: 0, 1: -.2, 2: .6, 3: .8 } };
  assert.deepEqual(parseEurostat(json).at(-1), { period: '2026-09', yoy: .8, mom: -.2 });
  assert.throws(() => parseEurostat(json, 'EA'), /Unexpected/);
  assert.throws(() => parseEurostat({ ...json, dimension: { ...json.dimension, coicop18: category({ CP00: 0 }) } }), /Unexpected/);
});
test('primary/alternative periods remain separate and retain their source metadata when cached', () => {
  const item = { ...snapshot('CA', [{ period: '2026-09', yoy: 1.8, mom: null }], [{ name: 'CPI-median', definition: 'Weighted median', source_url: CATALOG.CA.source_url, rates: [{ period: '2026-08', yoy: 2, mom: null }] }]), fetched_at: '2026-10-29T00:00:00Z' };
  const out = coreObservation(item, Date.parse(item.fetched_at) + TTL, TTL);
  assert.equal(out.status, 'stale'); assert.equal(out.period, '2026-09'); assert.equal(out.alternatives[0].period, '2026-08');
  assert.equal(out.alternatives[0].rates, undefined);
  assert.throws(() => snapshot('CA', []), /No valid/);
});
test('one foreign core failure preserves that country snapshot and does not block another country refresh', async () => {
  const fetched_at = '2026-10-28T00:00:00Z';
  const saved = { ...snapshot('DK', [{ period: '2026-08', yoy: 2.1, mom: 0 }]), fetched_at };
  const service = createCountryEconomics({ now: () => Date.parse('2026-10-29T12:00:00Z'), store: { load: async d => d === 'core_cpi' ? [saved] : [], save: async () => {} },
    fetchFn: async () => { throw Error('offline'); }, foreignCoreLoader: async country => { if (country === 'DK') throw Error('offline'); return snapshot(country, [{ period: '2026-09', yoy: 2, mom: .1 }]); } });
  await service.get('usddkk'); await service.refresh();
  const old = (await service.get('usddkk')).countries[1].core_cpi;
  assert.equal(old.yoy, 2.1); assert.equal(old.status, 'stale'); assert.equal(old.fetched_at, fetched_at);
  const fresh = (await service.get('usdcad')).countries[1].core_cpi;
  assert.equal(fresh.period, '2026-09'); assert.equal(fresh.status, 'available');
});

const COUNTRIES = {
  US: { name: 'United States', currency: 'USD', bank: 'Federal Reserve' },
  XM: { name: 'Euro area', currency: 'EUR', bank: 'European Central Bank' },
  GB: { name: 'United Kingdom', currency: 'GBP', bank: 'Bank of England' },
  JP: { name: 'Japan', currency: 'JPY', bank: 'Bank of Japan' },
  AU: { name: 'Australia', currency: 'AUD', bank: 'Reserve Bank of Australia' },
  CA: { name: 'Canada', currency: 'CAD', bank: 'Bank of Canada' },
  DK: { name: 'Denmark', currency: 'DKK', bank: 'Danmarks Nationalbank' },
  CH: { name: 'Switzerland', currency: 'CHF', bank: 'Swiss National Bank' },
  TH: { name: 'Thailand', currency: 'THB', bank: 'Bank of Thailand' },
};
const PAIRS = { eurusd: ['XM', 'US'], gbpusd: ['GB', 'US'], usdjpy: ['US', 'JP'], audusd: ['AU', 'US'], usdcad: ['US', 'CA'], usddkk: ['US', 'DK'], usdchf: ['US', 'CH'], usdthb: ['US', 'TH'], gold: ['US'], wti: ['US'], brent: ['US'] };
const TTL = 6 * 3600000;
const SOURCE = { policy: 'https://data.bis.org/topics/CBPOL', cpi: 'https://data.bis.org/topics/CPI' };
const CPI_PUBLISHERS = { US: 'US Bureau of Labor Statistics', XM: 'Eurostat', GB: 'Office for National Statistics', JP: 'Statistics Bureau of Japan', AU: 'Australian Bureau of Statistics', CA: 'Statistics Canada', DK: 'Statistics Denmark', CH: 'Swiss Federal Statistical Office', TH: 'Ministry of Commerce, Thailand' };
const DATASETS = ['policy', 'cpi', 'core_cpi'];
const { parseFredCsv } = require('./macro-data');
const { CATALOG, loadForeignCore, coreObservation } = require('./core-inflation');

function parseCoreCpi(adjusted, unadjusted, fetchedAt) {
  const rows = text => text.map(row => ({ period: row.date.slice(0, 7), value: row.value }));
  const sa = rows(parseFredCsv(adjusted, 'CPILFESL'));
  const nsa = rows(parseFredCsv(unadjusted, 'CPILFENS'));
  if (!sa.length || !nsa.length) throw Error('Empty US core CPI response');
  return { id: 'core_cpi:US', country: 'US', dataset: 'core_cpi', name: 'US Core CPI', frequency: 'Monthly', unit: 'index',
    publisher: 'US Bureau of Labor Statistics', source_url: 'https://fred.stlouisfed.org/series/CPILFESL',
    yoy_source_url: 'https://fred.stlouisfed.org/series/CPILFENS', provider: 'FRED',
    definition: 'CPI-U excluding food and energy. YoY uses the unadjusted CPILFENS index; MoM uses seasonally adjusted CPILFESL. Both changes use the displayed observation month; calculated values may differ from published rounded rates.',
    rows: sa, annual_rows: nsa, fetched_at: fetchedAt };
}

// SDMX CSV includes quoted metadata with commas and embedded line breaks.
function parseCsv(text) {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) {
      row.push(field.replace(/\r$/, '')); field = '';
      if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else field += c;
  }
  if (quoted) throw Error('Unclosed CSV field');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  const header = rows.shift()?.map(s => s.replace(/^\uFEFF/, ''));
  if (!['REF_AREA', 'TIME_PERIOD', 'OBS_VALUE', 'UNIT_MEASURE', 'FREQ'].every(key => header?.includes(key))) throw Error('Unexpected BIS response');
  return rows.map(values => Object.fromEntries(header.map((key, i) => [key, values[i]])));
}
function parseDataset(text, dataset, fetchedAt) {
  const grouped = new Map();
  for (const row of parseCsv(text)) {
    if (!Object.hasOwn(COUNTRIES, row.REF_AREA) || !row.OBS_VALUE?.trim() || !Number.isFinite(Number(row.OBS_VALUE))) continue;
    const policy = dataset === 'policy';
    if (row.FREQ !== (policy ? 'D' : 'M') || row.UNIT_MEASURE !== (policy ? '368' : '628')) continue;
    if (!(policy ? /^\d{4}-\d{2}-\d{2}$/ : /^\d{4}-\d{2}$/).test(row.TIME_PERIOD)) continue;
    if (row.UNIT_MULT && row.UNIT_MULT !== '0') continue;
    const id = `${dataset}:${row.REF_AREA}`;
    if (!grouped.has(id)) grouped.set(id, { id, country: row.REF_AREA, dataset, frequency: policy ? 'Daily' : 'Monthly',
      name: policy ? 'Policy benchmark' : 'Headline CPI', unit: policy ? '%' : 'index',
      publisher: policy ? row.SOURCE_REF || COUNTRIES[row.REF_AREA].bank : CPI_PUBLISHERS[row.REF_AREA],
      definition: policy ? row.COMPILATION || 'See BIS policy-rate methodology.' : 'All-items consumer price index, not seasonally adjusted. Changes calculated from index observations.' + (row.REF_AREA === 'AU' ? ' BIS constructs this monthly series from quarterly Australian CPI; MoM is intentionally not displayed.' : ''),
      source_url: SOURCE[dataset], fetched_at: fetchedAt, rows: [] });
    grouped.get(id).rows.push({ period: row.TIME_PERIOD, value: Number(row.OBS_VALUE) });
  }
  return [...grouped.values()].map(item => ({ ...item, rows: [...new Map(item.rows.map(row => [row.period, row])).values()].sort((a, b) => a.period.localeCompare(b.period)) }));
}
function observation(item, now) {
  if (item?.dataset === 'core_cpi' && item.rates) return coreObservation(item, now, TTL);
  if (!item?.rows.length) return { status: 'unavailable', value: null };
  const latest = item.rows.at(-1), previous = item.rows.at(-2);
  const common = { ...item, rows: undefined, annual_rows: undefined, period: latest.period, previous_period: previous?.period || null,
    previous: previous?.value ?? null, status: now - Date.parse(item.fetched_at) >= TTL ? 'stale' : 'available',
    history: item.rows.slice(-24), value: latest.value };
  if (item.dataset === 'policy') {
    let i = item.rows.length - 1;
    while (i > 0 && item.rows[i - 1].value === latest.value) i--;
    return { ...common, previous: i > 0 ? item.rows[i - 1].value : null,
      previous_period: i > 0 ? item.rows[i - 1].period : null,
      last_change_period: i > 0 ? item.rows[i].period : null };
  }
  const change = (period) => {
    const before = item.rows.find(row => row.period === period);
    return before?.value > 0 ? (latest.value / before.value - 1) * 100 : null;
  };
  const year = Number(latest.period.slice(0, 4)), month = Number(latest.period.slice(5));
  const monthBefore = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
  let yoy = change(`${year - 1}-${String(month).padStart(2, '0')}`);
  if (item.dataset === 'core_cpi') {
    const current = item.annual_rows.find(row => row.period === latest.period);
    const prior = item.annual_rows.find(row => row.period === `${year - 1}-${String(month).padStart(2, '0')}`);
    yoy = current && prior?.value > 0 ? (current.value / prior.value - 1) * 100 : null;
  }
  return { ...common, yoy, mom: item.country === 'AU' ? null : change(monthBefore) };
}
function createCountryEconomics({ fetchFn = fetch, now = Date.now, store, onError = () => {}, foreignCoreLoader = loadForeignCore } = {}) {
  let memory = [], initialized, pending, retryAfter = 0, persistence = 'unknown';
  async function initialize() {
    if (!initialized) initialized = (async () => {
      if (!store) return;
      try { memory = (await Promise.all(DATASETS.map(d => store.load(d)))).flat(); persistence = 'mysql'; }
      catch (error) { persistence = 'unavailable'; onError(error); }
    })();
    await initialized;
  }
  function refresh() {
    if (pending) return pending;
    if (now() < retryAfter) return Promise.resolve();
    pending = (async () => {
      const codes = Object.keys(COUNTRIES).join('+');
      const since = new Date(now() - 800 * 86400000).toISOString().slice(0, 10);
      let storageFailed = false;
      async function save(items, dataset) {
        const merged = new Map(memory.map(item => [item.id, item]));
        items.forEach(item => merged.set(item.id, item)); memory = [...merged.values()];
        if (store) {
          try { await store.save(dataset, items); persistence = 'mysql'; }
          catch (error) { storageFailed = true; persistence = 'unavailable'; onError(error); }
        }
      }
      await Promise.all(DATASETS.map(async dataset => {
        const datasetCountries = Object.keys(COUNTRIES);
        if (datasetCountries.every(code => memory.some(item => item.id === `${dataset}:${code}` && now() - Date.parse(item.fetched_at) < TTL))) return;
        if (dataset === 'core_cpi') {
          await Promise.all(datasetCountries.map(async country => {
            if (memory.some(item => item.id === `core_cpi:${country}` && now() - Date.parse(item.fetched_at) < TTL)) return;
            try {
              const fetchedAt = new Date(now()).toISOString();
              let item;
              if (country === 'US') {
                const texts = await Promise.all(['CPILFESL', 'CPILFENS'].map(async series => {
                  const response = await fetchFn(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series}&cosd=${since}`, { signal: AbortSignal.timeout(20000) });
                  if (!response.ok) throw Error(`FRED ${series} HTTP ${response.status}`);
                  return response.text();
                }));
                item = { ...CATALOG.US, ...parseCoreCpi(texts[0], texts[1], fetchedAt) };
              } else item = { ...await foreignCoreLoader(country, { fetchFn, since }), fetched_at: fetchedAt };
              await save([item], dataset);
            } catch (error) { onError(error); }
          }));
          return;
        }
        try {
            const path = dataset === 'policy' ? `WS_CBPOL/D.${codes}` : `WS_LONG_CPI/M.${codes}.628`;
            const response = await fetchFn(`https://stats.bis.org/api/v1/data/${path}?startPeriod=${since}&format=csv`, { signal: AbortSignal.timeout(20000) });
            if (!response.ok) throw Error(`BIS ${dataset} HTTP ${response.status}`);
            const items = parseDataset(await response.text(), dataset, new Date(now()).toISOString());
            if (!items.length) throw Error(`Empty BIS ${dataset} response`);
            await save(items, dataset);
        } catch (error) { onError(error); }
      }));
      if (storageFailed) persistence = 'unavailable';
      retryAfter = now() + 60000;
    })().finally(() => { pending = null; });
    return pending;
  }
  return {
    async get(instrument) {
      if (typeof instrument !== 'string' || !Object.hasOwn(PAIRS, instrument)) { const error = Error('Unknown instrument'); error.status = 400; throw error; }
      await initialize();
      const required = PAIRS[instrument];
      const needsRefresh = required.some(code => DATASETS.some(dataset => !memory.some(item => item.id === `${dataset}:${code}` && now() - Date.parse(item.fetched_at) < TTL)));
      const hasSaved = required.some(code => memory.some(item => item.country === code));
      const missingCore = required.some(code => !memory.some(item => item.id === `core_cpi:${code}`));
      if (needsRefresh) { if (hasSaved && !missingCore) void refresh(); else await refresh(); }
      return { success: true, instrument, persistence, refreshing: Boolean(pending), countries: required.map(code => ({ code, ...COUNTRIES[code],
        policy: observation(memory.find(item => item.id === `policy:${code}`), now()),
        cpi: observation(memory.find(item => item.id === `cpi:${code}`), now()),
        core_cpi: { ...CATALOG[code], frequency: 'Monthly', ...observation(memory.find(item => item.id === `core_cpi:${code}`), now()) },
      })), notes: 'Core measures differ by jurisdiction and must not be compared as identical baskets. Published and calculated rates are labelled, as are seasonal adjustments. Swiss core uses a harmonised HICP alternative, not FSO core inflation 1 or SNB TM15. BIS headline/policy releases can lag national sources. No economic calendar is connected.' };
    },
    refresh,
  };
}
module.exports = { COUNTRIES, PAIRS, TTL, parseCsv, parseDataset, parseCoreCpi, observation, createCountryEconomics };

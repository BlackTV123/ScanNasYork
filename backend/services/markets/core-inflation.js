// Country-specific core measures. No provider's percentage series is treated as an index.
const CATALOG = {
  US: { name: 'Core CPI-U', definition: 'Excludes food and energy. YoY uses unadjusted CPILFENS; MoM uses seasonally adjusted CPILFESL.', publisher: 'US Bureau of Labor Statistics', provider: 'FRED', source_url: 'https://fred.stlouisfed.org/series/CPILFESL', yoy_adjustment: 'NSA', mom_adjustment: 'SA' },
  XM: { name: 'HICP excluding energy, food, alcohol & tobacco', definition: 'Euro-area HICP excluding energy, food, alcohol and tobacco; changing euro-area composition. Published unadjusted annual and monthly rates from the current ECOICOP version 2 dataset.', publisher: 'Eurostat', provider: 'Eurostat', source_url: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table?lang=en', yoy_adjustment: 'NSA', mom_adjustment: 'NSA' },
  GB: { name: 'Core CPI excluding energy, food, alcohol & tobacco', definition: 'ONS CPI excluding energy, food, alcoholic beverages and tobacco. Published 12-month (DKO8) and 1-month (DKI7) rates, not seasonally adjusted.', publisher: 'Office for National Statistics', provider: 'ONS', source_url: 'https://www.ons.gov.uk/economy/inflationandpriceindices/timeseries/dko8/mm23', yoy_adjustment: 'NSA', mom_adjustment: 'NSA' },
  JP: { name: 'CPI excluding fresh food', definition: 'Japan national core CPI excludes fresh food but retains energy. YoY and MoM calculated from the 2025-base unadjusted index; MoM is seasonal and may differ from the official adjusted change.', publisher: 'Statistics Bureau of Japan', provider: 'Statistics Bureau of Japan', source_url: 'https://www.stat.go.jp/english/data/cpi/', yoy_adjustment: 'NSA', mom_adjustment: 'NSA' },
  AU: { name: 'Trimmed mean CPI', definition: 'ABS underlying inflation removes the bottom and top 15% of weighted price changes. Published monthly seasonally adjusted changes; the annual rate must not be converted into a monthly rate.', publisher: 'Australian Bureau of Statistics', provider: 'ABS', source_url: 'https://www.abs.gov.au/statistics/economy/price-indexes-and-inflation/consumer-price-index-australia/latest-release', yoy_adjustment: 'SA', mom_adjustment: 'SA' },
  CA: { name: 'CPI-trim', definition: 'One of the Bank of Canada preferred core measures. Removes the bottom and top 20% of weighted monthly price changes; excluded components vary. Published 12-month rate based on seasonally adjusted components. This feed does not supply the monthly change.', publisher: 'Statistics Canada', provider: 'Bank of Canada', source_url: 'https://www.bankofcanada.ca/rates/price-indexes/cpi/', yoy_adjustment: 'SA', mom_adjustment: null },
  DK: { name: 'CPI excluding energy & unprocessed food', definition: 'Statistics Denmark national core CPI excludes energy and unprocessed food; processed food remains included. PRIS01 commodity group 151, published annual and monthly changes, not seasonally adjusted.', publisher: 'Statistics Denmark', provider: 'StatBank', source_url: 'https://www.statbank.dk/PRIS01', yoy_adjustment: 'NSA', mom_adjustment: 'NSA' },
  CH: { name: 'Core HICP (harmonised alternative)', definition: 'Swiss HICP excluding energy, food, alcohol and tobacco. This harmonised comparison is NOT FSO core inflation 1 or SNB TM15 and is not presented as the SNB preferred measure. Published unadjusted annual and monthly rates, ECOICOP version 2.', publisher: 'Swiss Federal Statistical Office / Eurostat', provider: 'Eurostat', source_url: 'https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_minr/default/table?lang=en', yoy_adjustment: 'NSA', mom_adjustment: 'NSA' },
  TH: { name: 'Core CPI excluding raw food & energy', definition: 'Thailand national core CPI excludes raw food and energy; processed food remains included. TPSO national series (region 5), published YoY and MoM, not seasonally adjusted.', publisher: 'Trade Policy and Strategy Office, Ministry of Commerce', provider: 'TPSO', source_url: 'https://tpso.go.th/en/indicators', yoy_adjustment: 'NSA', mom_adjustment: 'NSA' },
};
function delimited(text, delimiter = ',') {
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === delimiter || c === '\n')) {
      row.push(field.replace(/\r$/, '')); field = '';
      if (c === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else field += c;
  }
  if (quoted) throw Error('Malformed inflation CSV');
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
const numeric = value => value != null && String(value).trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : null;
function sorted(rows) {
  return [...new Map(rows.filter(r => /^\d{4}-(0[1-9]|1[0-2])$/.test(r.period) && (r.yoy != null || r.mom != null || r.value != null)).map(r => [r.period, r])).values()].sort((a, b) => a.period.localeCompare(b.period)).slice(-36);
}
function fromIndex(rows) {
  const byPeriod = new Map(rows.filter(r => r.value > 0).map(r => [r.period, r.value]));
  return sorted(rows.map(row => {
    const year = Number(row.period.slice(0, 4)), month = Number(row.period.slice(5));
    const previousMonth = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, '0')}`;
    const change = p => byPeriod.has(p) && row.value > 0 ? (row.value / byPeriod.get(p) - 1) * 100 : null;
    return { period: row.period, yoy: change(`${year - 1}-${String(month).padStart(2, '0')}`), mom: change(previousMonth) };
  }));
}
function csvObjects(text, delimiter = ',') {
  const rows = delimited(text, delimiter), header = rows.shift();
  if (!header) throw Error('Empty inflation CSV');
  return rows.map(values => Object.fromEntries(header.map((key, i) => [key.replace(/^\uFEFF/, ''), values[i]])));
}
function parseOns(text, code) {
  const rows = delimited(text);
  if (!rows.some(r => r[0] === 'CDID' && r[1] === code)) throw Error('Unexpected ONS series');
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return rows.flatMap(r => {
    const match = /^(\d{4}) ([A-Z]{3})$/.exec(r[0]);
    const month = match ? months.indexOf(match[2]) + 1 : 0;
    return month && numeric(r[1]) != null ? [{ period: `${match[1]}-${String(month).padStart(2, '0')}`, value: numeric(r[1]) }] : [];
  });
}
function joinRates(annual, monthly = []) {
  const months = new Map(monthly.map(r => [r.period, r.value]));
  // An annual and monthly rate may only share a row when their periods match.
  return sorted(annual.map(r => ({ period: r.period, yoy: r.value, mom: months.get(r.period) ?? null })));
}
function parseCanada(json, series) {
  if (!json.seriesDetail?.[series] || !Array.isArray(json.observations)) throw Error('Unexpected Bank of Canada response');
  return sorted(json.observations.map(r => ({ period: r.d?.slice(0, 7), yoy: numeric(r[series]?.v), mom: null })));
}
function parseAbs(text, index) {
  const rows = csvObjects(text).filter(r => r.FREQ === 'M' && r.REGION === '50' && r.INDEX === index && r.TSEST === '20' && r.UNIT_MEASURE === 'PCT');
  return joinRates(rows.filter(r => r.MEASURE === '3').map(r => ({ period: r.TIME_PERIOD, value: numeric(r.OBS_VALUE) })),
    rows.filter(r => r.MEASURE === '2').map(r => ({ period: r.TIME_PERIOD, value: numeric(r.OBS_VALUE) })));
}
function parseDenmark(text) {
  const rows = csvObjects(text, ';').filter(r => r.VAREGR === '151');
  const rate = unit => rows.filter(r => r.ENHED === unit).map(r => ({ period: r.TID?.replace('M', '-'), value: numeric(r.INDHOLD) }));
  return joinRates(rate('300'), rate('200'));
}
function parseJapan(text, title) {
  const rows = delimited(text), headers = rows.find(r => r[0] === 'Group/Item');
  const column = headers?.indexOf(title) ?? -1;
  if (column < 0 || headers.filter(h => h === title).length !== 1) throw Error('Unexpected Japanese CPI columns');
  return fromIndex(rows.filter(r => /^\d{6}$/.test(r[0])).map(r => ({ period: `${r[0].slice(0, 4)}-${r[0].slice(4)}`, value: numeric(r[column]) })));
}
function parseThailand(json) {
  if (!Array.isArray(json)) throw Error('Unexpected TPSO response');
  return sorted(json.filter(r => r.index_id === '0000000000093000' && r.region_id === 5 && r.base_year === 2023)
    .map(r => ({ period: `${r.year}-${String(r.month).padStart(2, '0')}`, yoy: numeric(r.yoy), mom: numeric(r.mon) })));
}
function parseEurostat(json, geo = 'CH') {
  if (!Array.isArray(json.id) || !json.dimension || !json.value || json.source !== 'ESTAT') throw Error('Unexpected Eurostat response');
  for (const [key, code] of [['geo', geo], ['freq', 'M'], ['coicop18', 'TOT_X_NRG_FOOD']]) {
    const codes = Object.keys(json.dimension[key]?.category.index || {});
    if (codes.length !== 1 || codes[0] !== code) throw Error('Unexpected Eurostat series');
  }
  const offsets = Object.fromEntries(json.id.map((key, i) => [key, json.size.slice(i + 1).reduce((a, b) => a * b, 1)]));
  const unitIndex = json.dimension.unit.category.index;
  const timeIndex = json.dimension.time.category.index;
  if (unitIndex.RCH_A == null || unitIndex.RCH_M == null) throw Error('Missing Eurostat rate units');
  const rate = (unit, time) => numeric(json.value[unitIndex[unit] * offsets.unit + time * offsets.time]);
  return sorted(Object.entries(timeIndex).map(([period, index]) => ({ period, yoy: rate('RCH_A', index), mom: rate('RCH_M', index) })));
}
function snapshot(country, rates, alternatives = []) {
  if (!rates.some(r => r.yoy != null || r.mom != null)) throw Error(`No valid core inflation observations for ${country}`);
  return { id: `core_cpi:${country}`, country, dataset: 'core_cpi', ...CATALOG[country], frequency: 'Monthly', unit: '%', rates, alternatives };
}
function coreObservation(item, now, ttl) {
  if (!item) return null;
  const latest = item.rates?.at(-1);
  if (!latest) return null;
  const { rates, alternatives, ...metadata } = item;
  return { ...metadata, value: latest.yoy, ...latest, history: rates.slice(-24),
    status: now - Date.parse(item.fetched_at) >= ttl ? 'stale' : 'available',
    alternatives: (alternatives || []).map(alt => ({ ...alt, rates: undefined, ...alt.rates?.at(-1), history: alt.rates?.slice(-24) })) };
}
async function loadForeignCore(country, { fetchFn = fetch, since }) {
  async function request(url, { json = false, encoding } = {}) {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`${CATALOG[country].provider} HTTP ${response.status}`);
    if (json) return response.json();
    return encoding ? new TextDecoder(encoding).decode(await response.arrayBuffer()) : response.text();
  }
  let result;
  switch (country) {
    case 'GB': {
      const [annual, monthly] = await Promise.all(['dko8', 'dki7'].map(code => request(`https://www.ons.gov.uk/generator?format=csv&uri=/economy/inflationandpriceindices/timeseries/${code}/mm23`)));
      result = snapshot(country, joinRates(parseOns(annual, 'DKO8'), parseOns(monthly, 'DKI7'))); break;
    }
    case 'CA': {
      const json = await request(`https://www.bankofcanada.ca/valet/observations/CPI_TRIM,CPI_MEDIAN/json?start_date=${since}`, { json: true });
      result = snapshot(country, parseCanada(json, 'CPI_TRIM'), [{ name: 'CPI-median', definition: 'Weighted median (50th percentile) of monthly component price changes. Published 12-month rate based on seasonally adjusted components; not a monthly change.', frequency: 'Monthly', yoy_adjustment: 'SA', mom_adjustment: null, source_url: CATALOG.CA.source_url, rates: parseCanada(json, 'CPI_MEDIAN') }]); break;
    }
    case 'AU': {
      const text = await request(`https://data.api.abs.gov.au/rest/data/ABS,CPI/2+3.999902+999903.20.50.M?startPeriod=${since.slice(0, 7)}&format=csv`);
      result = snapshot(country, parseAbs(text, '999902'), [{ name: 'Weighted median CPI', definition: 'ABS price change at the 50th percentile of weighted component price changes; seasonally adjusted monthly series.', frequency: 'Monthly', yoy_adjustment: 'SA', mom_adjustment: 'SA', source_url: CATALOG.AU.source_url, rates: parseAbs(text, '999903') }]); break;
    }
    case 'DK': result = snapshot(country, parseDenmark(await request('https://api.statbank.dk/v1/data/PRIS01/CSV?lang=en&valuePresentation=Code&VAREGR=151&ENHED=200,300&Tid=*'))); break;
    case 'JP': {
      const text = await request('https://www.stat.go.jp/data/cpi/2025/csv/zmi2025aa.csv', { encoding: 'shift_jis' });
      result = snapshot(country, parseJapan(text, 'All items, less fresh food'), [{ name: 'CPI excluding fresh food and energy', definition: 'Often called core-core CPI in Japan. Excludes fresh food AND energy, unlike the primary Japanese core measure. Changes calculated from the unadjusted 2025-base index.', frequency: 'Monthly', yoy_adjustment: 'NSA', mom_adjustment: 'NSA', source_url: CATALOG.JP.source_url, rates: parseJapan(text, 'All items, less fresh food and energy') }]); break;
    }
    case 'TH': result = snapshot(country, parseThailand(await request('https://fms.tpso.go.th/api/v2/moc-indexes/cpig-core', { json: true }))); break;
    case 'XM':
    case 'CH': {
      const geo = country === 'XM' ? 'EA' : 'CH';
      result = snapshot(country, parseEurostat(await request(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_minr?geo=${geo}&coicop18=TOT_X_NRG_FOOD&unit=RCH_A&unit=RCH_M&sinceTimePeriod=${since.slice(0, 7)}`, { json: true }), geo)); break;
    }
    default: throw Error('Unknown core inflation country');
  }
  return result;
}
module.exports = { CATALOG, delimited, fromIndex, parseOns, joinRates, parseCanada, parseAbs, parseDenmark, parseJapan, parseThailand, parseEurostat, snapshot, coreObservation, loadForeignCore };

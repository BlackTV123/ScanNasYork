const { createMarketCache } = require('./market-cache');
const SERIES = [
  { id: 'DFF', name: 'Effective Fed funds rate', unit: '%', frequency: 'Daily', publisher: 'Federal Reserve Board' },
  { id: 'CPIAUCSL', name: 'US CPI inflation, YoY', unit: '%', frequency: 'Monthly', publisher: 'US Bureau of Labor Statistics', derived: true },
  { id: 'DGS10', name: 'US 10-year Treasury yield', unit: '%', frequency: 'Daily', publisher: 'Federal Reserve Board' },
  { id: 'DFII10', name: 'US 10-year real yield', unit: '%', frequency: 'Daily', publisher: 'Federal Reserve Board' },
  { id: 'DTWEXBGS', name: 'Broad US dollar index', unit: 'index', frequency: 'Daily', publisher: 'Federal Reserve Board' },
];
function parseFredCsv(csv, id) {
  const lines = csv.trim().replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines[0] !== `observation_date,${id}` && lines[0] !== `DATE,${id}`) throw new Error('Unexpected economic data response');
  return lines.slice(1).map(line => {
    const [date, value] = line.split(',');
    return { date, value: value?.trim() && value !== '.' ? Number(value) : NaN };
  }).filter(row => /^\d{4}-\d{2}-\d{2}$/.test(row.date) && Number.isFinite(row.value)).sort((a, b) => a.date.localeCompare(b.date));
}
function macroObservation(series, rows) {
  const latest = rows.at(-1);
  if (!latest) throw new Error('No economic observations available');
  let value = latest.value;
  if (series.derived) {
    const previousYear = `${Number(latest.date.slice(0, 4)) - 1}${latest.date.slice(4, 7)}`;
    const previous = rows.find(row => row.date.startsWith(previousYear));
    if (!previous || previous.value <= 0) throw new Error('Previous-year CPI unavailable');
    value = (latest.value / previous.value - 1) * 100;
  }
  return { ...series, value, observation_date: latest.date,
    source_url: `https://fred.stlouisfed.org/series/${series.id}`,
    calculation: series.derived ? 'Year-over-year change calculated from the seasonally adjusted CPI index; may differ from the headline unadjusted CPI rate.' : null };
}
function createMacroService({ fetchFn = fetch, now = Date.now } = {}) {
  const cache = createMarketCache(3600000, { now });
  return {
    async get() {
      const results = await Promise.allSettled(SERIES.map(series => cache.get(series.id, async () => {
        const since = new Date(now() - 800 * 86400000).toISOString().slice(0, 10);
        const response = await fetchFn(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${series.id}&cosd=${since}`, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Economic source HTTP ${response.status}`);
        return { ...macroObservation(series, parseFredCsv(await response.text(), series.id)), fetched_at: new Date(now()).toISOString() };
      })));
      return { success: true, scope: 'United States macro context', source: 'FRED, Federal Reserve Bank of St. Louis', data: results.map((result, i) =>
        result.status === 'fulfilled' ? { ...result.value, status: result.value.stale ? 'stale' : 'available' } : {
          ...SERIES[i], status: 'unavailable', value: null, observation_date: null,
          source_url: `https://fred.stlouisfed.org/series/${SERIES[i].id}`,
        }) };
    },
  };
}
module.exports = { SERIES, parseFredCsv, macroObservation, createMacroService };

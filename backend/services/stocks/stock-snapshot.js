/** Refresh all sources for one selected stock, once per minute per backend process. */
const { hasFinancialHistory } = require('./financial-history');
function createStockSnapshotService({ exists, chart, fundamentals, financials, readDetail, readFinancials,
  onUpdated = () => {}, onSourceError = () => {}, now = Date.now }) {
  const cache = new Map();
  const pending = new Map();
  async function load(symbol, cachedEntry) {
    if (!await exists(symbol)) {
      const error = new Error('Stock not found');
      error.status = 404;
      throw error;
    }
    const cached = cachedEntry?.response;
    const results = await Promise.allSettled([
      cached?.chart?.success ? Promise.resolve(cached.chart) : chart(symbol),
      cached?.forecast?.success ? Promise.resolve(cached.forecast) : fundamentals(symbol),
      financials(symbol),
    ]);
    const names = ['price_chart', 'yahoo_fundamentals', 'sec_financials'];
    const sources = {};
    const warnings = [];
    results.forEach((result, index) => {
      const name = names[index];
      if (result.status === 'rejected') {
        onSourceError(name, symbol, result.reason);
        sources[name] = { status: 'failed' };
        warnings.push(`Could not refresh ${name}; saved data may be displayed.`);
      } else {
        sources[name] = { status: result.value?.status || 'updated' };
        if (index === 2 && result.value?.providers) Object.assign(sources, result.value.providers);
      }
    });
    onUpdated();
    const reads = await Promise.allSettled([readDetail(symbol), readFinancials(symbol)]);
    reads.forEach((result, index) => {
      if (result.status === 'rejected') {
        const name = index === 0 ? 'saved_details' : 'saved_financials';
        onSourceError(name, symbol, result.reason);
        warnings.push(`Could not load ${name}.`);
      }
    });
    const [detail, savedFinancials] = reads.map(result => result.status === 'fulfilled' ? result.value : { success: false });
    const value = index => results[index].status === 'fulfilled' ? results[index].value : null;
    const response = { success: true, symbol, detail, financials: savedFinancials,
      chart: value(0), forecast: value(1) || { success: false }, sources, warnings,
      fetched_at: new Date(now()).toISOString() };
    // Retrying missing history must not extend the price/company cache lifetime.
    cache.set(symbol, { ts: cachedEntry?.ts ?? now(), response });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return response;
  }
  return {
    async get(symbol) {
      if (pending.has(symbol)) return pending.get(symbol);
      const entry = cache.get(symbol);
      const fresh = entry && now() - entry.ts < 60000;
      if (fresh && hasFinancialHistory(entry.response.financials?.data)) return entry.response;
      const task = load(symbol, fresh ? entry : undefined).finally(() => pending.delete(symbol));
      pending.set(symbol, task);
      return task;
    },
    updateFavorite(symbol, value) {
      const entry = cache.get(symbol);
      if (entry?.response.detail?.data) entry.response.detail.data.is_favorite = value;
    },
  };
}

module.exports = { createStockSnapshotService };

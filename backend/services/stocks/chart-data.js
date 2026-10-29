/** A price and its candles are returned as one snapshot, from the same chart. */
function createChartDataService({ yahoo, ticker, calculateIndicators, onPriceUpdated = () => {}, now = Date.now }) {
  const cache = new Map();
  const pending = new Map();

  async function load(symbol, range, interval) {
    const [result, quote] = await Promise.all([
      yahoo.chart(symbol, { period1: '1970-01-01', interval }),
      // Only use the quote's previous close to calculate the daily change.
      // The displayed price always comes from the latest plotted candle.
      yahoo.quote(symbol).catch(() => null),
    ]);
    const bars = (result?.quotes || []).filter(bar =>
      [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) &&
      bar.date instanceof Date && Number.isFinite(bar.date.getTime())
    ).sort((a, b) => a.date - b.date);
    if (!bars.length) {
      const error = new Error('No chart data available');
      error.status = 404;
      throw error;
    }
    const data = bars.map(bar => ({
      time: bar.date.toISOString().split('T')[0],
      open: Number(bar.open.toFixed(2)), high: Number(bar.high.toFixed(2)),
      low: Number(bar.low.toFixed(2)), close: Number(bar.close.toFixed(2)),
      volume: bar.volume || 0,
    }));
    const price = data[data.length - 1].close;
    const previousClose = quote?.regularMarketPreviousClose ??
      (interval === '1d' && data.length > 1 ? data[data.length - 2].close : null);
    const change = Number.isFinite(previousClose) && previousClose > 0
      ? Number(((price - previousClose) / previousClose * 100).toFixed(2)) : null;
    const priceSnapshot = {
      price, price_change_pct: change,
      candle_time: data[data.length - 1].time,
      fetched_at: new Date(now()).toISOString(),
    };
    const update = { current_price: price, price_change_pct: change };
    if (calculateIndicators && interval === '1d') {
      const indicators = calculateIndicators(bars.map(bar => ({ o: bar.open, h: bar.high, l: bar.low, c: bar.close, v: bar.volume })));
      for (const key of ['rsi_14', 'rsi_7', 'macd', 'macd_signal', 'macd_histogram', 'bb_upper', 'bb_middle', 'bb_lower', 'atr_14']) {
        update[key] = indicators[key];
      }
      update.volume = bars[bars.length - 1].volume || 0;
      update.last_technical_update = new Date(now());
    }
    await ticker.update(update, { where: { symbol } });
    onPriceUpdated();
    return { success: true, symbol, range, interval, data, price_snapshot: priceSnapshot };
  }

  return {
    async get(symbol, range, interval, { refresh = false } = {}) {
      const key = `${symbol}:${range}`;
      // Share an ongoing refresh, including when another request still has old cache.
      if (pending.has(key)) return pending.get(key);
      const entry = cache.get(key);
      if (!refresh && entry && now() - entry.ts < 60000) return entry.data;
      const task = load(symbol, range, interval).then(data => {
        cache.set(key, { ts: now(), data });
        if (cache.size > 100) cache.delete(cache.keys().next().value);
        return data;
      }).finally(() => pending.delete(key));
      pending.set(key, task);
      return task;
    },
  };
}

module.exports = { createChartDataService };

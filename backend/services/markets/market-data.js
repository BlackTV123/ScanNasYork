const { createMarketCache } = require('./market-cache');

const INSTRUMENTS = [
  { id: 'eurusd', symbol: 'EURUSD=X', name: 'EUR/USD', group: 'Forex', currency: 'USD', precision: 5, unit: 'USD per EUR', banks: 'Federal Reserve and European Central Bank', region: 'United States and euro area' },
  { id: 'gbpusd', symbol: 'GBPUSD=X', name: 'GBP/USD', group: 'Forex', currency: 'USD', precision: 5, unit: 'USD per GBP', banks: 'Federal Reserve and Bank of England', region: 'United States and United Kingdom' },
  { id: 'usdjpy', symbol: 'JPY=X', name: 'USD/JPY', group: 'Forex', currency: 'JPY', precision: 3, unit: 'JPY per USD', banks: 'Federal Reserve and Bank of Japan', region: 'United States and Japan' },
  { id: 'audusd', symbol: 'AUDUSD=X', name: 'AUD/USD', group: 'Forex', currency: 'USD', precision: 5, unit: 'USD per AUD', banks: 'Federal Reserve and Reserve Bank of Australia', region: 'United States and Australia' },
  { id: 'usdcad', symbol: 'CAD=X', name: 'USD/CAD', group: 'Forex', currency: 'CAD', precision: 5, unit: 'CAD per USD', banks: 'Federal Reserve and Bank of Canada', region: 'United States and Canada' },
  { id: 'usddkk', symbol: 'DKK=X', name: 'USD/DKK', group: 'Forex', currency: 'DKK', precision: 5, unit: 'DKK per USD', banks: 'Federal Reserve and Danmarks Nationalbank', region: 'United States and Denmark' },
  { id: 'usdchf', symbol: 'CHF=X', name: 'USD/CHF', group: 'Forex', currency: 'CHF', precision: 5, unit: 'CHF per USD', banks: 'Federal Reserve and Swiss National Bank', region: 'United States and Switzerland' },
  { id: 'usdthb', symbol: 'THB=X', name: 'USD/THB', group: 'Forex', currency: 'THB', precision: 3, unit: 'THB per USD', banks: 'Federal Reserve and Bank of Thailand', region: 'United States and Thailand' },
  { id: 'gold', symbol: 'GC=F', name: 'Gold', group: 'Commodities', currency: 'USD', precision: 2, unit: 'USD per troy ounce', kind: 'COMEX gold futures' },
  { id: 'wti', symbol: 'CL=F', name: 'WTI crude', group: 'Commodities', currency: 'USD', precision: 2, unit: 'USD per barrel', kind: 'NYMEX WTI crude oil futures' },
  { id: 'brent', symbol: 'BZ=F', name: 'Brent crude', group: 'Commodities', currency: 'USD', precision: 2, unit: 'USD per barrel', kind: 'Brent crude oil futures' },
];
const TIMEFRAMES = {
  '5m': { days: 7, interval: '5m' },
  '15m': { days: 14, interval: '15m' },
  '30m': { days: 31, interval: '30m' },
  '1h': { days: 59, interval: '1h' },
  '4h': { days: 180, interval: '1h' },
  '1d': { days: 730, interval: '1d' },
  '1wk': { days: 1826, interval: '1wk' },
};

function aggregateFourHours(bars, now) {
  const buckets = new Map();
  for (const bar of bars) {
    const start = Math.floor(bar.date.getTime() / 14400000) * 14400000;
    let candle = buckets.get(start);
    if (!candle) {
      candle = { date: new Date(start), open: bar.open, high: bar.high, low: bar.low, close: bar.close, source_count: 0 };
      buckets.set(start, candle);
    }
    candle.high = Math.max(candle.high, bar.high);
    candle.low = Math.min(candle.low, bar.low);
    candle.close = bar.close;
    candle.source_count++;
    candle.complete = candle.source_count === 4 && now >= start + 14400000;
  }
  // Only buckets containing real source bars exist; closures and gaps are never filled.
  return [...buckets.values()];
}

function createForexService({ yahoo, now = Date.now }) {
  const cache = createMarketCache(60000, { now });
  return {
    async get(id, timeframe = '1h') {
      const instrument = INSTRUMENTS.find(item => item.id === id);
      const config = typeof timeframe === 'string' && Object.hasOwn(TIMEFRAMES, timeframe) ? TIMEFRAMES[timeframe] : null;
      if (!instrument || !config) { const error = new Error('Unknown instrument or chart timeframe'); error.status = 400; throw error; }
      return cache.get(`${id}:${timeframe}`, async () => {
        const requestedStart = now() - config.days * 86400000;
        const period1 = new Date(timeframe === '4h' ? Math.floor(requestedStart / 14400000) * 14400000 : requestedStart);
        const [chart, quote] = await Promise.all([
          yahoo.chart(instrument.symbol, { period1, interval: config.interval }),
          yahoo.quote(instrument.symbol).catch(() => null),
        ]);
        let bars = (chart?.quotes || []).filter(bar => bar.date instanceof Date && Number.isFinite(bar.date.getTime()) &&
          [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) &&
          bar.low <= Math.min(bar.open, bar.close) && bar.high >= Math.max(bar.open, bar.close)).sort((a, b) => a.date - b.date);
        const dateOnly = timeframe === '1d' || timeframe === '1wk';
        let sessionTimezone = chart?.meta?.exchangeTimezoneName || 'UTC';
        let formatter;
        try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: sessionTimezone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
        catch { sessionTimezone = 'UTC'; formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }); }
        const sessionDate = date => {
          const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
          return `${parts.year}-${parts.month}-${parts.day}`;
        };
        // Deduplicate revisions first. Yahoo may then append a live quote/daily row to
        // an intraday/weekly series: merge it into its period without losing the wick/open.
        bars = [...new Map(bars.map(bar => [bar.date.getTime(), bar])).values()];
        if (!bars.length) throw new Error('No market candles available');
        const sourceAsOf = bars.at(-1).date.toISOString();
        const seconds = { '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 3600 }[timeframe];
        // Keep Yahoo's weekly starting weekday in the exchange's calendar.
        const weekDay = new Date(sessionDate(bars[0].date) + 'T00:00:00Z').getUTCDay();
        const candles = new Map();
        for (const bar of bars) {
          let key;
          if (dateOnly) {
            key = sessionDate(bar.date);
            if (timeframe === '1wk') {
              const day = new Date(key + 'T00:00:00Z');
              day.setUTCDate(day.getUTCDate() - (day.getUTCDay() - weekDay + 7) % 7);
              key = day.toISOString().slice(0, 10);
            }
          } else key = Math.floor(bar.date.getTime() / (seconds * 1000)) * seconds * 1000;
          const existing = candles.get(key);
          if (existing) {
            existing.high = Math.max(existing.high, bar.high);
            existing.low = Math.min(existing.low, bar.low);
            existing.close = bar.close;
          } else candles.set(key, { ...bar, date: dateOnly ? bar.date : new Date(key), session_date: dateOnly ? key : null });
        }
        bars = [...candles.values()];
        const outputBars = timeframe === '4h' ? aggregateFourHours(bars, now()) : bars;
        const data = outputBars.map(bar => ({
          time: dateOnly ? bar.session_date : Math.floor(bar.date.getTime() / 1000),
          open: bar.open, high: bar.high, low: bar.low, close: bar.close,
        }));
        const price = data.at(-1).close;
        const finite = value => Number.isFinite(value) ? value : null;
        const validSpread = Number.isFinite(quote?.bid) && Number.isFinite(quote?.ask) && quote.bid <= quote.ask && quote.ask !== 0;
        const previousClose = finite(quote?.regularMarketPreviousClose) ??
          (config.interval === '1d' && bars.length > 1 ? bars.at(-2).close : null);
        return {
          success: true, instrument, timeframe, interval: timeframe, source_interval: config.interval, data,
          lookback_days: config.days, time_zone: dateOnly ? sessionTimezone : 'UTC',
          coverage: { from: data[0].time, to: data.at(-1).time },
          aggregation: timeframe === '4h' ? { method: 'UTC buckets starting at 00:00, 04:00, 08:00, 12:00, 16:00 and 20:00', last_source_count: outputBars.at(-1).source_count, last_complete: outputBars.at(-1).complete } : null,
          fetched_at: new Date(now()).toISOString(), source: 'Yahoo Finance',
          source_url: `https://finance.yahoo.com/quote/${encodeURIComponent(instrument.symbol)}/`,
          market: {
            price, change_pct: previousClose != null && previousClose !== 0 ? (price - previousClose) / Math.abs(previousClose) * 100 : null,
            as_of: sourceAsOf, previous_close: previousClose,
            open: finite(quote?.regularMarketOpen), day_low: finite(quote?.regularMarketDayLow), day_high: finite(quote?.regularMarketDayHigh),
            year_low: finite(quote?.fiftyTwoWeekLow), year_high: finite(quote?.fiftyTwoWeekHigh),
            bid: validSpread ? quote.bid : null, ask: validSpread ? quote.ask : null,
            volume: instrument.group === 'Forex' && !quote?.regularMarketVolume ? null : finite(quote?.regularMarketVolume),
            market_state: quote?.marketState || null,
            exchange: quote?.fullExchangeName || quote?.exchange || null,
          },
        };
      });
    },
  };
}
module.exports = { INSTRUMENTS, TIMEFRAMES, aggregateFourHours, createForexService };

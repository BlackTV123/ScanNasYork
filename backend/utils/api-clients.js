/**
 * External API Clients
 * Wrappers for Polygon.io, Financial Modeling Prep, and Alpha Vantage.
 */

const logger = require('./logger');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
      if (response.status === 429) {
        const wait = parseInt(response.headers.get('retry-after') || '60', 10);
        logger.warn(`Rate limited, waiting ${wait}s (attempt ${attempt}/${retries})`);
        await sleep(wait * 1000);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      return await response.json();
    } catch (err) {
      if (attempt === retries) {
        logger.error(`API failed after ${retries} attempts`, { error: err.message });
        throw err;
      }
      await sleep(delay * Math.pow(2, attempt - 1));
    }
  }
}

class PolygonClient {
  constructor(apiKey) { this.apiKey = apiKey; this.base = 'https://api.polygon.io'; }

  async getGroupedDaily(date) {
    const data = await fetchWithRetry(`${this.base}/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&apiKey=${this.apiKey}`);
    return data.results || [];
  }

  async getAggregateBars(ticker, from, to, timespan = 'day') {
    const data = await fetchWithRetry(`${this.base}/v2/aggs/ticker/${ticker}/range/1/${timespan}/${from}/${to}?adjusted=true&sort=asc&apiKey=${this.apiKey}`);
    return data.results || [];
  }

  async getAllTickers(limit = 1000) {
    const tickers = [];
    let url = `${this.base}/v3/reference/tickers?market=stocks&active=true&limit=${limit}&apiKey=${this.apiKey}`;
    while (url) {
      const data = await fetchWithRetry(url);
      if (data.results) tickers.push(...data.results);
      url = data.next_url ? `${data.next_url}&apiKey=${this.apiKey}` : null;
      if (url) await sleep(250);
    }
    return tickers;
  }

  async getTickerDetails(ticker) {
    return await fetchWithRetry(`${this.base}/v3/reference/tickers/${ticker}?apiKey=${this.apiKey}`);
  }

  async getPreviousClose(ticker) {
    const data = await fetchWithRetry(`${this.base}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${this.apiKey}`);
    return data.results?.[0] || null;
  }
}

class FMPClient {
  constructor(apiKey) { this.apiKey = apiKey; this.base = 'https://financialmodelingprep.com/api/v3'; }

  async getEarningsCalendar(from, to) {
    return await fetchWithRetry(`${this.base}/earning_calendar?from=${from}&to=${to}&apiKey=${this.apiKey}`);
  }

  async getIncomeStatement(symbol, period = 'quarter', limit = 8) {
    return await fetchWithRetry(`${this.base}/income-statement/${symbol}?period=${period}&limit=${limit}&apiKey=${this.apiKey}`);
  }

  async getCompanyProfile(symbol) {
    const data = await fetchWithRetry(`${this.base}/profile/${symbol}?apiKey=${this.apiKey}`);
    return data?.[0] || null;
  }
}

class AlphaVantageClient {
  constructor(apiKey) { this.apiKey = apiKey; this.base = 'https://www.alphavantage.co/query'; }

  async getDailyTimeSeries(symbol, outputSize = 'compact') {
    const data = await fetchWithRetry(`${this.base}?function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}&outputsize=${outputSize}&apikey=${this.apiKey}`);
    return data['Time Series (Daily)'] || {};
  }

  async getRSI(symbol, interval = 'daily', timePeriod = 14) {
    const data = await fetchWithRetry(`${this.base}?function=RSI&symbol=${symbol}&interval=${interval}&time_period=${timePeriod}&series_type=close&apikey=${this.apiKey}`);
    return data['Technical Analysis: RSI'] || {};
  }

  async getMACD(symbol, interval = 'daily') {
    const data = await fetchWithRetry(`${this.base}?function=MACD&symbol=${symbol}&interval=${interval}&series_type=close&apikey=${this.apiKey}`);
    return data['Technical Analysis: MACD'] || {};
  }
}

function createApiClients() {
  return {
    polygon: new PolygonClient(process.env.POLYGON_API_KEY),
    fmp: new FMPClient(process.env.FMP_API_KEY),
    alphaVantage: new AlphaVantageClient(process.env.ALPHA_VANTAGE_API_KEY),
  };
}

module.exports = { PolygonClient, FMPClient, AlphaVantageClient, createApiClients, fetchWithRetry, sleep };

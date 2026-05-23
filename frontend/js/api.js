/**
 * ScanNasYork — API Client
 */

const API_BASE = '/api/v1';

async function apiRequest(endpoint, params = {}) {
  const url = new URL(API_BASE + endpoint, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/** Screen stocks with filters */
async function screenStocks(filters = {}) {
  return apiRequest('/stocks/screen', filters);
}

/** Get stock detail */
async function getStockDetail(symbol) {
  return apiRequest(`/stocks/${symbol.toUpperCase()}`);
}

/** Get candlestick chart data (on-demand from Yahoo) */
async function getChartData(symbol, range = '3m') {
  return apiRequest(`/stocks/${symbol.toUpperCase()}/chart`, { range });
}

/** Get analyst forecast data (on-demand from Yahoo) */
async function getForecast(symbol) {
  return apiRequest(`/stocks/${symbol.toUpperCase()}/forecast`);
}

/** Get available sectors */
async function getSectors() {
  return apiRequest('/stocks/sectors');
}

/** Health check */
async function healthCheck() {
  return apiRequest('/health');
}

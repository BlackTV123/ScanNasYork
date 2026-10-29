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

/** Refresh all sources for this stock; the backend shares a one-minute snapshot. */
async function getStockSnapshot(symbol) {
  return apiRequest(`/stocks/${symbol.toUpperCase()}/snapshot`);
}

/** Read saved annual/quarterly history directly from MySQL; no upstream refresh. */
async function getSavedFinancials(symbol) {
  return apiRequest(`/stocks/${symbol.toUpperCase()}/financial-chart`);
}

/** Get candlestick chart data (on-demand from Yahoo) */
async function getChartData(symbol, range = '3m', { refresh = false } = {}) {
  return apiRequest(`/stocks/${symbol.toUpperCase()}/chart`, { range, refresh: refresh ? 'true' : undefined });
}

/** Get analyst forecast data (on-demand from Yahoo) */
async function getForecast(symbol) {
  return apiRequest(`/stocks/${symbol.toUpperCase()}/forecast`);
}

/** Get available sectors */
async function getSectors() {
  return apiRequest('/stocks/sectors');
}

/** Toggle favorite status in database */
async function toggleFavorite(symbol) {
  const response = await fetch(`${API_BASE}/stocks/${symbol.toUpperCase()}/favorite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }
  return response.json();
}

/** Health check */
async function healthCheck() {
  return apiRequest('/health');
}

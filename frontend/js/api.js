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

/** Get stock price history */
async function getStockHistory(symbol, days = 30) {
  return apiRequest(`/stocks/${symbol.toUpperCase()}/history`, { days });
}

/** Get available sectors */
async function getSectors() {
  return apiRequest('/stocks/sectors');
}

/** Health check */
async function healthCheck() {
  return apiRequest('/health');
}

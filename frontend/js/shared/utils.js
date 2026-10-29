/**
 * ScanNasYork — Utility Functions
 */

/** Format large numbers: $15.2B, $850M, $1.2K */
function formatLargeNumber(value) {
  if (value == null || isNaN(value)) return '—';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e12) return sign + '$' + (abs / 1e12).toFixed(2) + 'T';
  if (abs >= 1e9) return sign + '$' + (abs / 1e9).toFixed(2) + 'B';
  if (abs >= 1e6) return sign + '$' + (abs / 1e6).toFixed(2) + 'M';
  if (abs >= 1e3) return sign + '$' + (abs / 1e3).toFixed(1) + 'K';
  return sign + '$' + abs.toLocaleString();
}

/** Format price: $185.50 */
function formatPrice(value) {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

/** Format percentage: +1.23% */
function formatPct(value, decimals = 2) {
  if (value == null || isNaN(value)) return '—';
  const num = parseFloat(value);
  const sign = num > 0 ? '+' : '';
  return sign + num.toFixed(decimals) + '%';
}

/** Format number with commas */
function formatNumber(value, decimals = 2) {
  if (value == null || isNaN(value)) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format volume: 52.3M */
function formatVolume(value) {
  if (value == null || isNaN(value)) return '—';
  if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B';
  if (value >= 1e6) return (value / 1e6).toFixed(1) + 'M';
  if (value >= 1e3) return (value / 1e3).toFixed(1) + 'K';
  return value.toString();
}

/** Get CSS class for positive/negative value */
function valueColorClass(value) {
  if (value == null || isNaN(value)) return 'cell-neutral';
  return parseFloat(value) >= 0 ? 'cell-positive' : 'cell-negative';
}

/** Get badge class based on RSI */
function rsiBadgeClass(rsi) {
  if (rsi == null) return 'neutral';
  if (rsi >= 70) return 'bearish';
  if (rsi <= 30) return 'bullish';
  return 'neutral';
}

/** Debounce function */
function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/** Show a toast notification */
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container') || createToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function createToastContainer() {
  const el = document.createElement('div');
  el.id = 'toast-container';
  el.className = 'toast-container';
  document.body.appendChild(el);
  return el;
}

/** Export data as CSV */
function exportCSV(data, filename = 'scannas_york_export.csv') {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => {
    const val = row[h];
    if (typeof val === 'string' && val.includes(',')) return `"${val}"`;
    return val ?? '';
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
  showToast('CSV exported successfully', 'success');
}

/** Parse URL query parameters */
function getQueryParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

/**
 * ScanNasYork — Main App (Screener Page)
 */

(function () {
  'use strict';

  // State
  let currentFilters = {};
  let currentSort = { by: 'symbol', order: 'asc' };
  let currentPage = 0;
  let pageSize = 50;
  let totalResults = 0;
  let lastData = [];

  // DOM refs
  const resultsBody = document.getElementById('results-body');
  const resultCount = document.getElementById('result-count');
  const execTime = document.getElementById('exec-time');
  const totalStocks = document.getElementById('total-stocks');
  const paginationEl = document.getElementById('pagination');
  const loadingOverlay = document.getElementById('loading-overlay');

  // ── Init ──
  document.addEventListener('DOMContentLoaded', async () => {
    setupPanelToggles();
    setupFilterListeners();
    setupSortHeaders();
    loadSectors();
    await runScreen();
  });

  // ── Panel Toggles ──
  function setupPanelToggles() {
    document.querySelectorAll('.panel-header').forEach(header => {
      header.addEventListener('click', () => {
        const body = header.nextElementSibling;
        const toggle = header.querySelector('.panel-toggle');
        body.classList.toggle('collapsed');
        toggle.textContent = body.classList.contains('collapsed') ? '+' : '−';
      });
    });
  }

  // ── Filter Listeners ──
  function setupFilterListeners() {
    // Screen button
    document.getElementById('btn-screen').addEventListener('click', () => {
      currentPage = 0;
      runScreen();
    });

    // Reset button
    document.getElementById('btn-reset').addEventListener('click', () => {
      document.querySelectorAll('.filter-group input').forEach(i => { i.value = ''; });
      document.getElementById('filter-search').value = '';
      document.querySelectorAll('.filter-group select').forEach(s => { s.selectedIndex = 0; });
      document.querySelectorAll('.toggle-switch').forEach(t => { t.classList.remove('active'); });
      currentFilters = {};
      currentPage = 0;
      runScreen();
    });

    // Export CSV
    document.getElementById('btn-export').addEventListener('click', () => {
      exportCSV(lastData);
    });

    // Toggle switches
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
      });
    });

    // Enter key on inputs
    document.querySelectorAll('.filter-group input, #filter-search').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { currentPage = 0; runScreen(); }
      });
    });
  }

  // ── Sort Headers ──
  function setupSortHeaders() {
    document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const field = th.dataset.sort;
        if (currentSort.by === field) {
          currentSort.order = currentSort.order === 'asc' ? 'desc' : 'asc';
        } else {
          currentSort.by = field;
          currentSort.order = 'asc';
        }
        // Update sort indicators
        document.querySelectorAll('.data-table th').forEach(h => h.classList.remove('sorted'));
        th.classList.add('sorted');
        const icon = th.querySelector('.sort-icon');
        if (icon) icon.textContent = currentSort.order === 'asc' ? '▲' : '▼';
        currentPage = 0;
        runScreen();
      });
    });
  }

  // ── Load Sectors ──
  async function loadSectors() {
    try {
      const res = await getSectors();
      const select = document.getElementById('filter-sector');
      if (select && res.data) {
        select.innerHTML = '<option value="">All Sectors</option>';
        res.data.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s;
          opt.textContent = s;
          select.appendChild(opt);
        });
      }
    } catch (e) { /* silent */ }
  }

  // ── Gather Filters ──
  function gatherFilters() {
    const f = {};
    const val = (id) => document.getElementById(id)?.value || undefined;
    const isActive = (id) => document.getElementById(id)?.classList.contains('active');

    f.rsi_min = val('filter-rsi-min');
    f.rsi_max = val('filter-rsi-max');
    f.eps_min = val('filter-eps-min');
    f.eps_max = val('filter-eps-max');
    f.revenue_min = val('filter-rev-min');
    f.revenue_max = val('filter-rev-max');
    f.pe_ratio_max = val('filter-pe-max');
    f.eps_yoy_growth_min = val('filter-growth-min');
    f.market_cap_min = val('filter-mcap-min');
    f.market_cap_max = val('filter-mcap-max');

    const searchVal = val('filter-search');
    if (searchVal) f.search = searchVal;

    const sector = val('filter-sector');
    if (sector) f.sector = sector;

    if (isActive('toggle-macd')) f.macd_positive = true;

    f.sort_by = currentSort.by;
    f.sort_order = currentSort.order;
    f.limit = pageSize;
    f.offset = currentPage * pageSize;

    return f;
  }

  // ── Run Screen ──
  async function runScreen() {
    showLoading(true);
    try {
      const filters = gatherFilters();
      const res = await screenStocks(filters);

      if (res.success) {
        lastData = res.data;
        totalResults = res.pagination.total_results;
        renderTable(res.data);
        renderPagination(res.pagination);
        if (resultCount) resultCount.textContent = totalResults.toLocaleString();
        if (execTime) execTime.textContent = `${res.execution_time_ms}ms`;
        if (totalStocks) totalStocks.textContent = totalResults.toLocaleString();
      }
    } catch (err) {
      showToast(err.message, 'error');
      renderEmpty('Failed to load data. Is the server running?');
    } finally {
      showLoading(false);
    }
  }

  // ── Render Table ──
  function renderTable(data) {
    if (!resultsBody) return;

    if (!data || data.length === 0) {
      renderEmpty('No stocks match your filters');
      return;
    }

    resultsBody.innerHTML = data.map(row => `
      <tr onclick="window.location.href='/stock.html?symbol=${row.symbol}'" title="View ${row.symbol} details">
        <td class="cell-symbol">${row.symbol}</td>
        <td class="cell-name" title="${row.company_name || ''}">${row.company_name || '—'}</td>
        <td><span class="cell-sector">${row.sector || '—'}</span></td>
        <td class="cell-number">${formatPrice(row.current_price)}</td>
        <td class="cell-number ${valueColorClass(row.price_change_pct)}">
          ${formatPct(row.price_change_pct)}
        </td>
        <td class="cell-number">
          <span class="cell-badge ${rsiBadgeClass(row.rsi_14)}">
            ${row.rsi_14 != null ? parseFloat(row.rsi_14).toFixed(1) : '—'}
          </span>
        </td>
        <td class="cell-number ${valueColorClass(row.macd)}">${row.macd != null ? parseFloat(row.macd).toFixed(4) : '—'}</td>
        <td class="cell-number">${row.ttm_eps != null ? formatNumber(row.ttm_eps) : '—'}</td>
        <td class="cell-number">${formatLargeNumber(row.ttm_revenue)}</td>
        <td class="cell-number">${row.pe_ratio != null ? formatNumber(row.pe_ratio) : '—'}</td>
        <td class="cell-number">${formatLargeNumber(row.market_cap)}</td>
        <td class="cell-number ${valueColorClass(row.latest_eps_yoy_growth)}">
          ${formatPct(row.latest_eps_yoy_growth)}
        </td>
        <td class="cell-number">${formatVolume(row.volume)}</td>
      </tr>
    `).join('');
  }

  // ── Render Empty ──
  function renderEmpty(message) {
    if (!resultsBody) return;
    resultsBody.innerHTML = `
      <tr><td colspan="12">
        <div class="empty-state">
          <div class="icon">📊</div>
          <h3>No Results</h3>
          <p>${message}</p>
        </div>
      </td></tr>
    `;
    if (paginationEl) paginationEl.innerHTML = '';
  }

  // ── Render Pagination ──
  function renderPagination(pag) {
    if (!paginationEl) return;
    const pages = pag.pages || 1;
    if (pages <= 1) { paginationEl.innerHTML = ''; return; }

    let html = '';
    html += `<button ${currentPage === 0 ? 'disabled' : ''} onclick="window.__paginate(0)">«</button>`;
    html += `<button ${currentPage === 0 ? 'disabled' : ''} onclick="window.__paginate(${currentPage - 1})">‹</button>`;

    const start = Math.max(0, currentPage - 2);
    const end = Math.min(pages, start + 5);

    for (let i = start; i < end; i++) {
      html += `<button class="${i === currentPage ? 'active' : ''}" onclick="window.__paginate(${i})">${i + 1}</button>`;
    }

    html += `<button ${currentPage >= pages - 1 ? 'disabled' : ''} onclick="window.__paginate(${currentPage + 1})">›</button>`;
    html += `<button ${currentPage >= pages - 1 ? 'disabled' : ''} onclick="window.__paginate(${pages - 1})">»</button>`;
    html += `<span class="page-info">Page ${currentPage + 1} of ${pages}</span>`;

    paginationEl.innerHTML = html;
  }

  // Expose paginate globally
  window.__paginate = (page) => {
    currentPage = page;
    runScreen();
    window.scrollTo({ top: document.querySelector('.table-container')?.offsetTop - 100, behavior: 'smooth' });
  };

  // ── Loading ──
  function showLoading(show) {
    if (loadingOverlay) {
      loadingOverlay.classList.toggle('active', show);
    }
  }
})();

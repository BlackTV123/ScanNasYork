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
  let favoritesOnly = false;
  let screenRequestId = 0;
  let searchTimer;

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
    setupWatchlistFilters();
    loadSectors();
    await runScreen();
  });

  // ── Panel Toggles ──
  function setupPanelToggles() {
    document.querySelectorAll('.panel-header').forEach(header => {
      const toggleButton = header.querySelector('.panel-toggle');
      if (!toggleButton) return;
      toggleButton.addEventListener('click', () => {
        const body = header.nextElementSibling;
        const toggle = header.querySelector('.panel-toggle');
        body.classList.toggle('collapsed');
        toggle.textContent = body.classList.contains('collapsed') ? '+' : '−';
        toggle.setAttribute('aria-expanded', String(!body.classList.contains('collapsed')));
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
    document.getElementById('btn-reset').addEventListener('click', () => resetScreenFilters());

    // Export CSV
    document.getElementById('btn-export').addEventListener('click', async () => {
      const btn = document.getElementById('btn-export');
      const originalText = btn.innerHTML;
      btn.textContent = 'Exporting…';
      btn.disabled = true;
      try {
        const filters = gatherFilters();
        filters.limit = 10000; // Fetch all results up to 10,000 for the CSV
        filters.offset = 0;
        const res = await screenStocks(filters);
        if (res.success && res.data.length > 0) {
          exportCSV(res.data);
        } else {
          showToast('No data to export', 'error');
        }
      } catch (err) {
        showToast('Export failed: ' + err.message, 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });

    // Toggle switches
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
      toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        toggle.setAttribute('aria-checked', String(toggle.classList.contains('active')));
      });
    });

    document.querySelectorAll('.toggle-switch').forEach(toggle => {
      toggle.addEventListener('keydown', event => {
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggle.click(); }
      });
    });

    // Search as the user types; explicit Enter/Screen cancels the pending debounce.
    document.getElementById('filter-search').addEventListener('input', event => {
      clearTimeout(searchTimer);
      if (event.isComposing) return;
      currentPage = 0;
      searchTimer = setTimeout(runScreen, 350);
    });

    // Enter key on inputs
    document.querySelectorAll('.filter-group input, #filter-search').forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.isComposing) { currentPage = 0; runScreen(); }
      });
    });
  }

  function resetScreenFilters(keepSearch = false) {
    document.querySelectorAll('.filter-group input').forEach(input => { input.value = ''; });
    if (!keepSearch) document.getElementById('filter-search').value = '';
    document.querySelectorAll('.filter-group select').forEach(select => { select.selectedIndex = 0; });
    document.querySelectorAll('.toggle-switch').forEach(toggle => { toggle.classList.remove('active'); toggle.setAttribute('aria-checked', 'false'); });
    favoritesOnly = false;
    for (const id of ['btn-watchlist', 'th-star-filter']) {
      const button = document.getElementById(id);
      button?.classList.remove('active'); button?.setAttribute('aria-pressed', 'false');
    }
    const icon = document.querySelector('#btn-watchlist .watchlist-icon');
    if (icon) icon.style.color = 'var(--text-muted)';
    currentFilters = {};
    currentPage = 0;
    runScreen();
  }

  // ── Sort Headers ──
  function setupSortHeaders() {
    document.querySelectorAll('.data-table th[data-sort]').forEach(th => {
      th.tabIndex = 0;
      th.setAttribute('aria-sort', th.classList.contains('sorted') ? 'ascending' : 'none');
      th.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); th.click(); }
      });
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
        document.querySelectorAll('th[data-sort]').forEach(h => h.setAttribute('aria-sort', 'none'));
        th.setAttribute('aria-sort', currentSort.order === 'asc' ? 'ascending' : 'descending');
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

    const parseWithSuffix = (id) => {
      const el = document.getElementById(id);
      if (!el || !el.value) return undefined;

      const str = el.value.toString().toUpperCase().trim();
      let multiplier = 1;

      if (str.endsWith('T')) multiplier = 1e12;      // Trillion (ล้านล้าน)
      else if (str.endsWith('B')) multiplier = 1e9;  // Billion (พันล้าน)
      else if (str.endsWith('M')) multiplier = 1e6;  // Million (ล้าน)
      else if (str.endsWith('K')) multiplier = 1e3;  // Thousand (พัน)

      // ลบตัวอักษรออกให้เหลือแต่ตัวเลขแล้วคูณด้วยหน่วย
      const numStr = str.replace(/[TBMK]/g, '');
      const num = parseFloat(numStr);

      return isNaN(num) ? undefined : num * multiplier;
    };

    const val = (id) => document.getElementById(id)?.value || undefined;
    const isActive = (id) => document.getElementById(id)?.classList.contains('active');

    f.rsi_min = val('filter-rsi-min');
    f.rsi_max = val('filter-rsi-max');
    f.eps_min = val('filter-eps-min');
    f.eps_max = val('filter-eps-max');
    f.revenue_min = parseWithSuffix('filter-rev-min');
    f.revenue_max = parseWithSuffix('filter-rev-max');
    f.market_cap_min = parseWithSuffix('filter-mcap-min');
    f.market_cap_max = parseWithSuffix('filter-mcap-max');
    f.pe_ratio_max = val('filter-pe-max');
    f.eps_yoy_growth_min = val('filter-growth-min');
    f.rev_growth_min = val('filter-rev-growth-min');
    f.rev_consecutive_years = val('filter-rev-consecutive');
    f.upside_min = val('filter-target-upside');

    const searchVal = val('filter-search');
    if (searchVal) f.search = searchVal;

    const sector = val('filter-sector');
    if (sector) f.sector = sector;

    if (isActive('toggle-macd')) f.macd_positive = true;
    if (isActive('toggle-base-building')) f.building_base = true;
    if (favoritesOnly) f.favorites_only = true;

    f.sort_by = currentSort.by;
    f.sort_order = currentSort.order;
    f.limit = pageSize;
    f.offset = currentPage * pageSize;

    return f;
  }

  // ── Run Screen ──
  async function runScreen() {
    clearTimeout(searchTimer);
    const requestId = ++screenRequestId;
    showLoading(true);
    try {
      const filters = gatherFilters();
      const res = await screenStocks(filters);
      if (requestId !== screenRequestId) return;

      if (res.success) {
        lastData = res.data;
        totalResults = res.pagination.total_results;
        renderTable(res.data, filters);
        renderPagination(res.pagination);
        if (resultCount) resultCount.textContent = totalResults.toLocaleString();
        if (execTime) execTime.textContent = `${res.execution_time_ms}ms`;
        if (totalStocks) totalStocks.textContent = totalResults.toLocaleString();
        const inlineTime = document.getElementById('exec-time-inline');
        if (inlineTime) inlineTime.textContent = `${res.execution_time_ms}ms`;
      }
    } catch (err) {
      if (requestId !== screenRequestId) return;
      showToast(err.message, 'error');
      renderEmpty('Failed to load data. Is the server running?');
    } finally {
      if (requestId === screenRequestId) showLoading(false);
    }
  }

  // ── Render Table ──
  function renderTable(data, filters = {}) {
    if (!resultsBody) return;

    if (!data || data.length === 0) {
      const hasFilters = Object.keys(filters).some(key => !['search', 'sort_by', 'sort_order', 'limit', 'offset'].includes(key));
      renderEmpty(hasFilters ? 'No stocks match the search and active filters. Watchlist and numeric filters can exclude a ticker.' : 'No stocks match this search.', hasFilters);
      return;
    }

    resultsBody.innerHTML = data.map(row => `
      <tr onclick="window.location.href='/stock.html?symbol=${row.symbol}'" title="View ${row.symbol} details">
        <td class="cell-star" onclick="event.stopPropagation(); window.__toggleStar('${row.symbol}', this)">
          <button type="button" aria-label="Toggle ${row.symbol} watchlist" aria-pressed="${!!row.is_favorite}" class="star-btn ${row.is_favorite ? 'starred active' : ''}" title="Toggle watchlist">${row.is_favorite ? '★' : '☆'}</button>
        </td>
        <td class="cell-symbol">${row.symbol}</td>
        <td class="cell-name" title="${row.company_name || ''}">${row.company_name || '—'}</td>
        <td><span class="cell-sector">${row.sector || '—'}</span></td>
        <td class="cell-number">${formatPrice(row.current_price)}</td>
        <td class="cell-number">${row.target_mean_price ? formatPrice(row.target_mean_price) : '—'}</td>
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
        <td class="cell-number ${valueColorClass(row.revenue_yoy_growth)}">
          ${formatPct(row.revenue_yoy_growth)} ${row.revenue_consecutive_years ? `<span style="font-size:0.8em; opacity:0.8">(${row.revenue_consecutive_years}y)</span>` : ''}
        </td>
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
  function renderEmpty(message, allowClear = false) {
    if (!resultsBody) return;
    resultsBody.innerHTML = `
      <tr><td colspan="16">
        <div class="empty-state">

          <h3>No Results</h3>
          <p>${message}</p>
        </div>
      </td></tr>
    `;
    if (allowClear) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-secondary'; button.textContent = 'Clear filters, keep search';
      button.addEventListener('click', () => resetScreenFilters(true));
      resultsBody.querySelector('.empty-state').append(button);
    }
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
    window.scrollTo({ top: document.querySelector('.table-container')?.offsetTop - 100, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  // Expose toggleStar globally
  window.__toggleStar = async (symbol, cell) => {
    const starBtn = cell.querySelector('.star-btn');
    if (!starBtn) return;

    try {
      starBtn.classList.add('star-pop');
      const res = await toggleFavorite(symbol);
      if (res.success) {
        const isFav = res.is_favorite;
        starBtn.classList.toggle('starred', isFav);
        starBtn.classList.toggle('active', isFav);
        starBtn.textContent = isFav ? '★' : '☆';
        starBtn.setAttribute('aria-pressed', String(isFav));
      }
    } catch (err) {
      if (window.showToast) {
        window.showToast('Failed to toggle favorite: ' + err.message, 'error');
      } else {
        alert('Failed to toggle favorite: ' + err.message);
      }
    } finally {
      setTimeout(() => starBtn.classList.remove('star-pop'), 300);
    }
  };

  // ── Watchlist Filters ──
  function setupWatchlistFilters() {
    const btnWatchlist = document.getElementById('btn-watchlist');
    const thStarFilter = document.getElementById('th-star-filter');

    const toggleWatchlistMode = () => {
      favoritesOnly = !favoritesOnly;

      // Update navbar button styles
      if (btnWatchlist) {
        btnWatchlist.classList.toggle('active', favoritesOnly);
        btnWatchlist.setAttribute('aria-pressed', String(favoritesOnly));
        const icon = btnWatchlist.querySelector('.watchlist-icon');
        if (icon) {
          icon.style.color = favoritesOnly ? 'var(--color-star)' : 'var(--text-muted)';
        }
      }

      // Update table header styles
      if (thStarFilter) {
        thStarFilter.classList.toggle('active', favoritesOnly);
        thStarFilter.setAttribute('aria-pressed', String(favoritesOnly));
      }

      currentPage = 0;
      runScreen();
    };

    if (btnWatchlist) {
      btnWatchlist.addEventListener('click', (e) => {
        e.preventDefault();
        toggleWatchlistMode();
      });
    }

    if (thStarFilter) {
      thStarFilter.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); thStarFilter.click(); }
      });
      thStarFilter.addEventListener('click', (e) => {
        e.preventDefault();
        toggleWatchlistMode();
      });
    }
  }

  // ── Loading ──
  function showLoading(show) {
    if (loadingOverlay) {
      loadingOverlay.classList.toggle('active', show);
    }
  }
})();

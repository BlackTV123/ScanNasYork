(function() {
  'use strict';

  const theme = getComputedStyle(document.documentElement);
  const token = name => theme.getPropertyValue(name).trim();

  const params = new URLSearchParams(window.location.search);
  const symbol = params.get('symbol');
  if (!symbol) { window.location.href = '/screener.html'; return; }

  document.title = `${symbol.toUpperCase()} | ScanNasYork`;

  // ── State ──
  let candlestickChart = null;
  let candlestickSeries = null;
  let volumeSeries = null;
  let chartRequestId = 0;
  let financialLoadState = 'loading';
  let snapshotFinancialsApplied = false;

  function applyFinancials(response, { fillMissingOnly = false } = {}) {
    if (!response?.success || !response.data) return false;
    const annual = Array.isArray(response.data.annual) ? response.data.annual : [];
    const quarterly = Array.isArray(response.data.quarterly) ? response.data.quarterly : [];
    // An empty/partial refresh must not erase history already read from MySQL.
    if (annual.length && (!fillMissingOnly || !window._annualData.length)) window._annualData = annual;
    if (quarterly.length && (!fillMissingOnly || !window._quarterlyData.length)) window._quarterlyData = quarterly;
    financialLoadState = 'ready';
    renderFinancialChart();
    return true;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const overlay = document.getElementById('loading-overlay');
    overlay.classList.add('active');
    renderFinancialChart();

    // Saved history is independent of Yahoo/SEC availability and refresh latency.
    getSavedFinancials(symbol).then(response => {
      if (!applyFinancials(response, { fillMissingOnly: snapshotFinancialsApplied })) throw new Error('Saved financial history unavailable');
    }).catch(() => {
      if (snapshotFinancialsApplied) return;
      financialLoadState = 'failed';
      renderFinancialChart();
    }).finally(() => overlay.classList.remove('active'));

    try {
      // One request refreshes only the selected stock and shares its one-minute cache.
      const snapshot = await getStockSnapshot(symbol);
      if (!snapshot.success) throw new Error('Could not load stock data');
      const detailRes = snapshot.detail;
      const financialRes = snapshot.financials;
      const chartRes = snapshot.chart;
      if (detailRes?.success) renderDetail(detailRes.data);
      snapshotFinancialsApplied = applyFinancials(financialRes);
      if (chartRes?.success) {
        renderPriceSnapshot(chartRes.price_snapshot);
        try {
          renderCandlestickChart(chartRes);
        } catch (error) {
          showToast('Price chart could not be displayed. Saved financial history remains available.', 'error');
        }
      } else {
        showToast('Could not refresh price and chart. Any displayed price is from the saved database.', 'error');
      }
      if (!detailRes?.success) showToast('Could not load company details.', 'error');

      loadForecast(snapshot.forecast || { success: false });
      if (snapshot.warnings?.length) showToast(snapshot.warnings.join(' '), 'error');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      overlay.classList.remove('active');
    }

    // Chart range buttons
    setupRangeButtons();
  });

  // ══════════════════════════════
  // Chart Range Buttons
  // ══════════════════════════════
  function setupRangeButtons() {
    const container = document.getElementById('chart-range-buttons');
    container.addEventListener('click', async (e) => {
      if (e.target.tagName !== 'BUTTON') return;
      const range = e.target.dataset.range;

      const requestId = ++chartRequestId;
      container.setAttribute('aria-busy', 'true');
      try {
        const res = await getChartData(symbol, range);
        if (requestId !== chartRequestId) return;
        if (!res.success) throw new Error('Chart unavailable');
        if (candlestickChart) updateCandlestickData(res);
        else renderCandlestickChart(res);
        renderPriceSnapshot(res.price_snapshot);
        container.querySelectorAll('button').forEach(button => button.classList.toggle('active', button.dataset.range === range));
      } catch (err) {
        if (requestId === chartRequestId) showToast('Could not refresh price and chart. Showing the previous snapshot.', 'error');
      } finally {
        if (requestId === chartRequestId) container.removeAttribute('aria-busy');
      }
    });
  }

  // ══════════════════════════════
  // TradingView Lightweight Charts
  // ══════════════════════════════
  function renderPriceSnapshot(snapshot) {
    if (!snapshot || !Number.isFinite(snapshot.price)) return;
    const priceEl = document.getElementById('detail-price');
    priceEl.textContent = formatPrice(snapshot.price);
    priceEl.title = `Chart snapshot fetched: ${snapshot.fetched_at}`;
    const changeEl = document.getElementById('detail-change');
    const pct = snapshot.price_change_pct;
    changeEl.textContent = pct == null ? '\u2212' : formatPct(pct);
    changeEl.style.color = pct == null ? 'var(--text-muted)' : pct >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)';
  }

  function renderCandlestickChart(chartRes) {
    const container = document.getElementById('candlestick-chart');

    candlestickChart = LightweightCharts.createChart(container, {
      layout: {
        background: { type: 'solid', color: token('--bg-card') },
        textColor: token('--text-muted'),
        fontFamily: token('--font-body'),
        fontSize: 11,
      },
      grid: {
        vertLines: { color: token('--border-subtle') },
        horzLines: { color: token('--border-subtle') },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: token('--border-control'),
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: token('--accent-primary'),
        },
        horzLine: {
          color: token('--border-control'),
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: token('--accent-primary'),
        },
      },
      rightPriceScale: {
        borderColor: token('--border-default'),
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: token('--border-default'),
        timeVisible: chartRes.interval !== '1d',
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
    });

    // Set layout options for dark theme
    candlestickChart.priceScale('right').applyOptions({
      textColor: token('--text-muted'),
    });
    candlestickChart.timeScale().applyOptions({
      textColor: token('--text-muted'),
    });

    // Candlestick series
    candlestickSeries = candlestickChart.addCandlestickSeries({
      upColor: token('--accent-primary'),
      downColor: token('--color-bearish'),
      borderUpColor: token('--accent-primary'),
      borderDownColor: token('--color-bearish'),
      wickUpColor: token('--accent-primary'),
      wickDownColor: token('--color-bearish'),
    });

    // Volume series
    volumeSeries = candlestickChart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Set initial data
    setCandlestickData(chartRes.data);

    // Auto-resize
    const observer = new ResizeObserver(() => {
      candlestickChart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });
    observer.observe(container);
  }

  function setCandlestickData(data) {
    if (!data || data.length === 0) return;

    const candleData = data.map(d => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const volumeData = data.map(d => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open
        ? token('--color-bullish-bg')
        : token('--color-bearish-bg'),
    }));

    candlestickSeries.setData(candleData);
    volumeSeries.setData(volumeData);
    candlestickChart.timeScale().fitContent();
  }

  function updateCandlestickData(chartRes) {
    // Update time scale settings for intraday vs daily
    candlestickChart.applyOptions({
      timeScale: {
        timeVisible: chartRes.interval !== '1d',
        secondsVisible: false,
      },
    });
    setCandlestickData(chartRes.data);
  }

  // ══════════════════════════════
  // Analyst Forecast
  // ══════════════════════════════
  async function loadForecast(prefetched) {
    const body = document.getElementById('forecast-body');
    try {
      const res = prefetched || await getForecast(symbol);
      if (res.success) {
        renderForecast(res.data);
      } else {
        body.innerHTML = '<div class="forecast-error">No forecast data available</div>';
      }
    } catch (err) {
      body.innerHTML = '<div class="forecast-error">Forecast data unavailable for this stock</div>';
    }
  }

  function renderForecast(data) {
    const body = document.getElementById('forecast-body');

    // Recommendation badge class mapping
    const recKey = (data.recommendation.key || 'none').toLowerCase().replace(/[\s_]/g, '-');
    const recLabel = (data.recommendation.key || '—').replace(/_/g, ' ').toUpperCase();

    // Target price
    const tp = data.target_price;
    const targetPriceHtml = tp.mean
      ? `<div class="value">${formatPrice(tp.mean)}</div>
         <div class="target-price-range">
           <span class="low">${formatPrice(tp.low)}</span>
           <span class="separator">&minus;</span>
           <span class="high">${formatPrice(tp.high)}</span>
         </div>`
      : '<div class="value" style="color:var(--text-muted)">&minus;</div>';

    // EPS estimates
    const eps = data.eps_estimates;
    const epsCurrentHtml = eps.current_quarter.estimate != null
      ? `<div class="est-value">$${parseFloat(eps.current_quarter.estimate).toFixed(2)}</div>
         <div class="est-range">${formatPrice(eps.current_quarter.low)} — ${formatPrice(eps.current_quarter.high)}</div>`
      : '<div class="est-value" style="color:var(--text-muted)">&minus;</div>';

    const epsNextHtml = eps.next_quarter.estimate != null
      ? `<div class="est-value">$${parseFloat(eps.next_quarter.estimate).toFixed(2)}</div>
         <div class="est-range">${formatPrice(eps.next_quarter.low)} — ${formatPrice(eps.next_quarter.high)}</div>`
      : '<div class="est-value" style="color:var(--text-muted)">&minus;</div>';

    // Revenue estimates
    const rev = data.revenue_estimates;
    const revCurrentHtml = rev.current_quarter.estimate != null
      ? `<div class="est-value">${formatLargeNumber(rev.current_quarter.estimate)}</div>
         <div class="est-range">${formatLargeNumber(rev.current_quarter.low)} — ${formatLargeNumber(rev.current_quarter.high)}</div>`
      : '<div class="est-value" style="color:var(--text-muted)">&minus;</div>';

    const revNextHtml = rev.next_quarter.estimate != null
      ? `<div class="est-value">${formatLargeNumber(rev.next_quarter.estimate)}</div>
         <div class="est-range">${formatLargeNumber(rev.next_quarter.low)} — ${formatLargeNumber(rev.next_quarter.high)}</div>`
      : '<div class="est-value" style="color:var(--text-muted)">&minus;</div>';

    // Earnings history
    const historyHtml = data.earnings_history.length > 0
      ? `<div class="earnings-history-grid">
          ${data.earnings_history.slice(0, 4).map(e => {
            const surprise = e.surprise_pct != null ? parseFloat(e.surprise_pct) : null;
            const surpriseClass = surprise != null ? (surprise >= 0 ? 'beat' : 'miss') : '';
            const surpriseText = surprise != null ? `${surprise >= 0 ? '+' : ''}${surprise.toFixed(2)}%` : '';
            return `
              <div class="earnings-history-item">
                <div class="quarter">${e.quarter || '—'}</div>
                <div class="actual">${e.actual != null ? '$' + parseFloat(e.actual).toFixed(2) : '—'}</div>
                ${surpriseText ? `<div class="surprise ${surpriseClass}">${surpriseText}</div>` : ''}
              </div>`;
          }).join('')}
        </div>`
      : '';

    body.innerHTML = `
      <!-- Target Price & Recommendation -->
      <div class="forecast-top-row">
        <div class="target-price-card">
          <div class="label">Target Price (Mean)</div>
          ${targetPriceHtml}
        </div>
        <div class="recommendation-card">
          <div class="recommendation-badge ${recKey}">${recLabel}</div>
          <div class="recommendation-analysts">${data.recommendation.analysts || 0} analysts</div>
        </div>
      </div>

      <!-- Estimates Grid -->
      <div class="estimate-grid">
        <div class="estimate-section">
          <div class="estimate-section-title">📊 EPS Estimates</div>
          <div class="estimate-row">
            <span class="est-label">Current Quarter</span>
            <div>${epsCurrentHtml}</div>
          </div>
          <div class="estimate-row">
            <span class="est-label">Next Quarter</span>
            <div>${epsNextHtml}</div>
          </div>
        </div>
        <div class="estimate-section">
          <div class="estimate-section-title">💰 Revenue Estimates</div>
          <div class="estimate-row">
            <span class="est-label">Current Quarter</span>
            <div>${revCurrentHtml}</div>
          </div>
          <div class="estimate-row">
            <span class="est-label">Next Quarter</span>
            <div>${revNextHtml}</div>
          </div>
        </div>
      </div>

      <!-- Earnings Surprise History -->
      ${historyHtml ? `<div style="margin-top:var(--space-md)">
        <div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);margin-bottom:var(--space-sm)">📈 Recent Earnings Surprise</div>
        ${historyHtml}
      </div>` : ''}
    `;
  }

  // ══════════════════════════════
  // Stock Detail
  // ══════════════════════════════
  function renderDetail(data) {
    document.getElementById('detail-symbol').textContent = data.symbol;
    document.getElementById('detail-name').textContent = data.company_name || '';
    document.getElementById('detail-sector').textContent = data.sector || '—';
    document.getElementById('stock-desc-text').textContent = data.description || 'No company description available.';

    // Set favorite star state
    const starBtn = document.getElementById('fav-star-btn');
    if (starBtn) {
      const isFav = data.is_favorite;
      starBtn.classList.toggle('starred', isFav);
      starBtn.classList.toggle('active', isFav);
      starBtn.textContent = isFav ? '★' : '☆';

      starBtn.onclick = async () => {
        try {
          starBtn.classList.add('star-pop');
          const res = await toggleFavorite(data.symbol);
          if (res.success) {
            const nextFav = res.is_favorite;
            starBtn.classList.toggle('starred', nextFav);
            starBtn.classList.toggle('active', nextFav);
            starBtn.textContent = nextFav ? '★' : '☆';
          }
        } catch (err) {
          alert('Failed to toggle favorite: ' + err.message);
        } finally {
          setTimeout(() => starBtn.classList.remove('star-pop'), 300);
        }
      };
    }

    const price = data.current_metrics?.price;
    document.getElementById('detail-price').textContent = formatPrice(price);

    const changePct = data.current_metrics?.price_change_pct;
    const changeEl = document.getElementById('detail-change');
    if (changePct != null) {
      const pct = parseFloat(changePct);
      changeEl.textContent = formatPct(pct);
      changeEl.style.color = pct >= 0 ? 'var(--color-bullish)' : 'var(--color-bearish)';
    }

    // Metrics cards
    const m = data.current_metrics || {};
    const f = data.fundamentals || {};
    const cards = [
      { label: 'RSI (14)', value: m.rsi_14 != null ? parseFloat(m.rsi_14).toFixed(1) : '—' },
      { label: 'MACD', value: m.macd != null ? parseFloat(m.macd).toFixed(4) : '—' },
      { label: 'Volume', value: formatVolume(m.volume) },
      { label: 'TTM EPS', value: f.ttm_eps != null ? formatNumber(f.ttm_eps) : '—' },
      { label: 'TTM Revenue', value: formatLargeNumber(f.ttm_revenue) },
      { label: 'P/E Ratio', value: f.pe_ratio != null ? formatNumber(f.pe_ratio) : '—' },
      { label: 'EPS YoY Growth', value: formatPct(f.latest_eps_yoy_growth) },
      { label: 'Market Cap', value: formatLargeNumber(data.market_cap) },
      { label: 'ATR (14)', value: m.atr_14 != null ? formatNumber(m.atr_14) : '—' },
    ];

    document.getElementById('metrics-grid').innerHTML = cards.map(c => `
      <div class="metric-card">
        <div class="metric-label">${c.label}</div>
        <div class="metric-value">${c.value}</div>
      </div>
    `).join('');

    // Earnings table — Annual rows with quarterly breakdowns
    renderEarningsTable(data.annual_history || [], data.quarterly_history || []);
  }

  function statementCurrency(currency) {
    return /^[A-Z]{3}$/.test(currency || '') ? currency : 'USD';
  }

  function formatStatementAmount(value, currency) {
    const code = statementCurrency(currency);
    return formatLargeNumber(value).replace('$', code === 'USD' ? '$' : code + ' ');
  }

  function renderEarningsTable(annualData, quarterlyData) {
    const tbody = document.getElementById('earnings-body');

    if (annualData.length === 0 && quarterlyData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center" style="padding:24px;color:var(--text-muted)">No earnings data available</td></tr>';
      return;
    }

    // 1. Group data by year
    const annualByYear = {};
    for (const a of annualData) annualByYear[a.fiscal_year] = a;

    const quartersByYear = {};
    for (const q of quarterlyData) {
      const yr = q.fiscal_year;
      if (!quartersByYear[yr]) quartersByYear[yr] = [];
      quartersByYear[yr].push(q);
    }

    // 2. Get unique years from both sources and sort descending
    const allYears = Array.from(new Set([
      ...Object.keys(annualByYear).map(Number),
      ...Object.keys(quartersByYear).map(Number)
    ])).sort((a, b) => b - a);

    // 3. Generate HTML
    let html = '';
    for (const yr of allYears) {
      const annual = annualByYear[yr];
      const quarters = quartersByYear[yr] || [];

      // Annual summary row (if exists for this year)
      if (annual) {
        html += `
          <tr class="row-annual">
            <td class="cell-period">📅 FY ${yr}</td>
            <td class="cell-number">${formatStatementAmount(annual.revenue, annual.currency)}</td>
            <td class="cell-number">${annual.eps != null ? formatNumber(annual.eps, 4) + ' ' + statementCurrency(annual.currency) : '—'}</td>
            <td class="cell-number">${formatStatementAmount(annual.net_income, annual.currency)}</td>
            <td class="cell-number" style="font-size:0.75rem">${annual.report_date || '—'}</td>
          </tr>`;
      } else {
        html += `
          <tr class="row-annual">
            <td class="cell-period">📅 FY ${yr}</td>
            <td class="cell-number" style="color:var(--text-muted)">&minus;</td>
            <td class="cell-number" style="color:var(--text-muted)">&minus;</td>
            <td class="cell-number" style="color:var(--text-muted)">&minus;</td>
            <td class="cell-number" style="color:var(--text-muted)">&minus;</td>
          </tr>`;
      }

      // Quarterly rows for this year
      quarters.sort((a, b) => b.fiscal_period.localeCompare(a.fiscal_period));
      for (const q of quarters) {
        html += `
        <tr class="row-quarter">
          <td class="cell-period">${q.fiscal_period}</td>
          <td class="cell-number">${formatStatementAmount(q.revenue, q.currency)}</td>
          <td class="cell-number">${q.eps != null ? formatNumber(q.eps, 4) + ' ' + statementCurrency(q.currency) : '—'}</td>
          <td class="cell-number">${formatStatementAmount(q.net_income, q.currency)}</td>
          <td class="cell-number" style="font-size:0.75rem">${q.report_date || '—'}</td>
        </tr>`;
      }
    }

    tbody.innerHTML = html;
  }

  // ══════════════════════════════
  // Financial Performance Chart
  // ══════════════════════════════
  window._annualData = [];
  window._quarterlyData = [];
  window._fpMetric = 'revenue';
  window._fpPeriod = 'quarterly';
  window._fpChart = null;

  window.switchFinMetric = function(metric) {
    window._fpMetric = metric;
    document.getElementById('fp-btn-revenue').classList.toggle('active', metric === 'revenue');
    document.getElementById('fp-btn-eps').classList.toggle('active', metric === 'eps');
    renderFinancialChart();
  };

  window.switchFinPeriod = function(period) {
    window._fpPeriod = period;
    document.getElementById('fp-btn-quarterly').classList.toggle('active', period === 'quarterly');
    document.getElementById('fp-btn-annual').classList.toggle('active', period === 'annual');
    renderFinancialChart();
  };

  function renderFinancialChart() {
    const canvas = document.getElementById('fin-perf-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (window._fpChart) {
      window._fpChart.destroy();
      window._fpChart = null;
    }

    let rawSource = window._fpPeriod === 'annual' ? window._annualData : window._quarterlyData;
    const status = document.getElementById('financial-chart-status');
    status.hidden = true;
    canvas.hidden = false;

    if (!Array.isArray(rawSource) || rawSource.length === 0) {
      const message = financialLoadState === 'loading' ? 'Loading saved financial history...'
        : financialLoadState === 'failed' ? 'Could not read saved financial history. Please try again.'
        : `No ${window._fpPeriod} financial history saved for ${symbol.toUpperCase()}.`;
      status.textContent = message;
      status.hidden = false;
      canvas.hidden = true;
      return;
    }
    if (typeof Chart !== 'function') {
      status.textContent = 'Saved financial history loaded, but the chart renderer could not be loaded. Please reload the page.';
      status.hidden = false;
      canvas.hidden = true;
      return;
    }

    let source = [...rawSource];
    const currency = statementCurrency(source[source.length - 1].currency);
    // A single axis must never mix reported currencies.
    source = source.filter(row => statementCurrency(row.currency) === currency);

    source.sort((a, b) => {
      if (a.fiscal_year !== b.fiscal_year) return a.fiscal_year - b.fiscal_year;
      const periodA = a.fiscal_period || '';
      const periodB = b.fiscal_period || '';
      return periodA.localeCompare(periodB);
    });

    const limit = window._fpPeriod === 'annual' ? 8 : 32;
    if (source.length > limit) {
      source = source.slice(-limit);
    }

    const labels = source.map(d => d.period || `${d.fiscal_period || ''} ${d.fiscal_year}`);
    let dataValues = source.map(d => d[window._fpMetric]);

    if (window._fpMetric === 'revenue') {
      dataValues = dataValues.map(v => v != null ? v / 1e9 : null);
    }

    const labelText = window._fpMetric === 'revenue' ? `Revenue (Billion ${currency})` : `EPS (${currency})`;
    const barColor = window._fpMetric === 'revenue' ? token('--accent-primary') : token('--color-neutral');

    const formatCurrency = (val, isBillion) => {
      if (val == null) return 'N/A';
      const sign = val < 0 ? '-' : '';
      const absVal = Math.abs(val).toFixed(2);
      return `${sign}${currency === 'USD' ? '$' : currency + ' '}${absVal}${isBillion ? 'B' : ''}`;
    };

    window._fpChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: labelText,
          data: dataValues,
          backgroundColor: barColor,
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: token('--text-primary'), font: { weight: 'bold' } } },
          tooltip: {
            backgroundColor: token('--bg-card'),
            borderColor: 'rgba(99, 102, 241, 0.2)',
            borderWidth: 1,
            titleColor: token('--text-primary'),
            bodyColor: token('--text-primary'),
            titleFont: { family: 'JetBrains Mono' },
            bodyFont: { family: 'JetBrains Mono' },
            callbacks: {
              label: function(context) {
                return `${labelText}: ${formatCurrency(context.raw, window._fpMetric === 'revenue')}`;
              }
            }
          }
        },
        scales: {
          x: { ticks: { color: token('--text-muted') }, grid: { color: token('--border-subtle') } },
          y: {
            ticks: {
                color: token('--text-muted'),
                callback: function(value) {
                    return formatCurrency(value, window._fpMetric === 'revenue');
                }
            },
            grid: { color: token('--border-subtle') }
          }
        }
      }
    });
  }
})();

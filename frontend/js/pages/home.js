(async function () {
  'use strict';
  const rows = document.getElementById('market-rows');
  const status = document.getElementById('market-status');
  try {
    const response = await fetch('/api/v1/stocks/screen?limit=4&sort_by=market_cap&sort_order=desc');
    if (!response.ok) throw new Error('Market preview unavailable');
    const result = await response.json();
    if (!result.success || !Array.isArray(result.data)) throw new Error('Market preview unavailable');
    if (!result.data.length) {
      rows.firstElementChild.textContent = 'Your market view starts in the screener.';
      status.textContent = 'No saved stocks yet';
      return;
    }
    const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    rows.replaceChildren(...result.data.slice(0, 4).map(stock => {
      const link = document.createElement('a');
      link.className = 'market-row';
      link.href = `/stock.html?symbol=${encodeURIComponent(stock.symbol)}`;
      const company = document.createElement('span');
      company.className = 'market-company';
      const symbol = document.createElement('strong');
      symbol.textContent = stock.symbol;
      const name = document.createElement('span');
      name.textContent = stock.company_name || '';
      name.title = name.textContent;
      company.append(symbol, name);
      const price = document.createElement('span');
      price.className = 'market-price';
      price.textContent = stock.current_price != null && Number.isFinite(Number(stock.current_price)) ? money.format(Number(stock.current_price)) : '\u2212';
      const change = document.createElement('span');
      change.className = 'market-change';
      const pct = stock.price_change_pct == null ? NaN : Number(stock.price_change_pct);
      change.textContent = Number.isFinite(pct) ? `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%` : '\u2212';
      if (Number.isFinite(pct)) change.classList.add(pct >= 0 ? 'positive' : 'negative');
      link.append(company, price, change);
      return link;
    }));
    status.textContent = 'Saved market data';
  } catch (error) {
    rows.replaceChildren();
    const message = document.createElement('p');
    message.className = 'preview-message';
    message.textContent = 'Market preview unavailable. Open the screener to explore.';
    rows.append(message);
    status.textContent = 'Preview unavailable';
  } finally {
    rows.setAttribute('aria-busy', 'false');
  }
})();

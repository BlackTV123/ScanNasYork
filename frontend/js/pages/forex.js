/* Selected-market page: no polling and no stock-table writes. */
(async function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const timeframes = ['5m', '15m', '30m', '1h', '4h', '1d', '1wk'];
  const timeframeLabels = { '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '4h': '4H', '1d': '1D', '1wk': '1W' };
  const query = new URLSearchParams(location.search);
  let selected = query.get('instrument') || 'eurusd';
  // Translate old bookmarked page ranges once; the API now uses explicit candle timeframes.
  const oldRange = { '1d': '5m', '1w': '1h', '1m': '1d', '3m': '1d', '1y': '1d' };
  let timeframe = timeframes.includes(query.get('timeframe')) ? query.get('timeframe') : Object.hasOwn(oldRange, query.get('range')) ? oldRange[query.get('range')] : '1h';
  let instruments = [], requestId = 0, economicsRequest = 0, chart, candles;
  const dateFormat = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const timeFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  async function api(path) {
    const response = await fetch('/api/v1/markets/' + path);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || 'Data could not be loaded.');
    return data;
  }
  function number(value, precision = 2) {
    return value != null && Number.isFinite(Number(value)) ? Number(value).toLocaleString('en-US', { minimumFractionDigits: precision, maximumFractionDigits: precision }) : '—';
  }
  function setStatus(message) { $('chart-status').textContent = message; $('chart-status').hidden = !message; }
  function renderInstruments() {
    $('instrument-list').replaceChildren();
    $('instrument-select').replaceChildren();
    for (const group of ['Forex', 'Commodities']) {
      const section = document.createElement('div'); section.className = 'instrument-group';
      const heading = document.createElement('h2'); heading.textContent = group; section.append(heading);
      const options = document.createElement('optgroup'); options.label = group;
      instruments.filter(item => item.group === group).forEach(item => {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = item.name; button.dataset.instrument = item.id;
        button.addEventListener('click', () => { selected = item.id; loadMarket(); }); section.append(button);
        const option = document.createElement('option'); option.value = item.id; option.textContent = item.name; options.append(option);
      });
      $('instrument-list').append(section); $('instrument-select').append(options);
    }
  }
  function renderDrivers(instrument) {
    let drivers;
    if (instrument.group === 'Forex') drivers = [
      ['Interest-rate expectations', `Compare policy signals from the ${instrument.banks}. Check the benchmark definitions and observation dates in the country comparison.`],
      ['Inflation and growth', `Watch inflation, employment and growth releases in the ${instrument.region}. Surprises can change expectations for monetary policy.`],
      ['Risk and capital flows', 'Positioning, global risk appetite and demand for US dollars can affect the pair. These relationships vary over time.'],
    ];
    else if (instrument.id === 'gold') drivers = [
      ['Real yields', 'Gold pays no interest. Inflation-adjusted bond yields are a useful opportunity-cost comparison, although the relationship is not constant.'],
      ['US dollar and inflation', 'Gold futures are quoted in USD. Dollar moves, inflation expectations and monetary-policy expectations can influence pricing.'],
      ['Demand and risk', 'Central-bank buying, investment flows, jewellery demand and geopolitical uncertainty can change demand. Futures contract changes can affect the chart.'],
    ];
    else drivers = [
      ['Supply and inventories', 'Watch OPEC+ production decisions, US inventory releases and outages. The US macro indicators are context, not an inventory or supply report.'],
      ['Demand and growth', 'Industrial activity, transport demand and global growth affect oil consumption. WTI and Brent also reflect different delivery markets.'],
      ['Dollar, geopolitics and contracts', 'Oil futures are quoted in USD. Shipping disruption, geopolitical events and futures contract changes can influence prices.'],
    ];
    if (instrument.id === 'usddkk') drivers.splice(0, 2,
      ['Euro exchange-rate policy', 'Denmark maintains a stable krone against the euro. The euro-dollar exchange rate and Danish exchange-rate policy are therefore relevant to USD/DKK.', 'https://www.nationalbanken.dk/en/frequently-asked-questions/questions-regarding-fixed-exchange-rate-policy'],
      ['Policy expectations', 'Watch Danmarks Nationalbank, the European Central Bank and the Federal Reserve. The comparison shows the Danish benchmark separately from US policy.']);
    $('market-drivers').replaceChildren(...drivers.map(([title, description, source]) => {
      const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = title; dd.textContent = description;
      if (source) {
        const link = document.createElement('a'); link.href = source; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = ' Policy source'; link.style.textDecoration = 'underline'; dd.append(link);
      }
      row.append(dt, dd); return row;
    }));
  }
  function renderFacts(data, precision) {
    const m = data.market;
    const facts = [
      ['Previous close', number(m.previous_close, precision)], ['Open', number(m.open, precision)],
      ['Day low / high', `${number(m.day_low, precision)} / ${number(m.day_high, precision)}`],
      ['52-week low / high', `${number(m.year_low, precision)} / ${number(m.year_high, precision)}`],
      ['Bid / ask', `${number(m.bid, precision)} / ${number(m.ask, precision)}`], ['Volume', number(m.volume, 0)],
      ['Market state', m.market_state || 'Unavailable'], ['Venue', m.exchange || 'Unavailable'],
    ];
    $('market-facts').replaceChildren(...facts.map(([label, value]) => {
      const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = label; dd.textContent = value; row.append(dt, dd); return row;
    }));
  }
  function renderChart(data, instrument) {
    if (!window.LightweightCharts) throw new Error('Chart renderer could not be loaded. Market statistics are still available.');
    if (!chart) {
      const element = $('market-chart');
      chart = LightweightCharts.createChart(element, {
        width: element.clientWidth, height: element.clientHeight,
        layout: { background: { type: 'solid', color: token('--bg-card') }, textColor: token('--text-muted'), fontFamily: token('--font-body'), fontSize: 11 },
        grid: { vertLines: { color: token('--border-subtle') }, horzLines: { color: token('--border-subtle') } },
        rightPriceScale: { borderColor: token('--border-default') },
        timeScale: { borderColor: token('--border-default') },
        handleScroll: { vertTouchDrag: false },
      });
      candles = chart.addCandlestickSeries({ upColor: token('--color-bullish'), downColor: token('--color-bearish'), borderVisible: false, wickUpColor: token('--color-bullish'), wickDownColor: token('--color-bearish') });
      new ResizeObserver(() => {
        chart.applyOptions({ width: element.clientWidth, height: element.clientHeight });
      }).observe(element);
    }
    candles.applyOptions({ priceFormat: { type: 'price', precision: instrument.precision, minMove: 10 ** -instrument.precision } });
    chart.timeScale().applyOptions({ timeVisible: !['1d', '1wk'].includes(data.timeframe), secondsVisible: false });
    candles.setData(data.data);
    const visibleBars = Math.min(180, Math.max(30, Math.floor($('market-chart').clientWidth / 6)));
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.data.length - visibleBars), to: data.data.length + 3 });
  }
  async function loadMarket() {
    const instrument = instruments.find(item => item.id === selected);
    if (!instrument) return;
    const id = ++requestId;
    $('instrument-select').value = selected;
    document.querySelectorAll('[data-instrument]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.instrument === selected)));
    document.querySelectorAll('[data-timeframe]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.timeframe === timeframe)));
    $('instrument-name').textContent = instrument.name;
    $('instrument-kind').textContent = instrument.kind || `${instrument.group} currency pair`;
    $('instrument-unit').textContent = instrument.unit;
    $('instrument-price').textContent = '—'; $('instrument-change').textContent = '—'; $('instrument-change').className = '';
    $('market-facts').replaceChildren(); $('market-asof').replaceChildren();
    $('chart-window').textContent = `${timeframeLabels[timeframe]} candles. Loading automatic history…`;
    $('chart-time-note').textContent = '';
    if (candles) candles.setData([]);
    renderDrivers(instrument); setStatus('Loading market data…');
    if ($('country-data').dataset.instrument !== selected) loadCountryEconomics();
    $('market-retry').disabled = true;
    $('market-chart').setAttribute('aria-busy', 'true');
    history.replaceState(null, '', `/forex.html?instrument=${selected}&timeframe=${timeframe}`);
    try {
      const data = await api(`${selected}/chart?timeframe=${timeframe}`);
      if (id !== requestId) return;
      $('instrument-price').textContent = number(data.market.price, instrument.precision);
      const change = data.market.change_pct;
      $('instrument-change').textContent = change == null ? 'Daily change unavailable' : `${change >= 0 ? '+' : ''}${number(change)}% vs previous close`;
      $('instrument-change').className = change == null ? '' : change >= 0 ? 'positive' : 'negative';
      const link = document.createElement('a'); link.href = data.source_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Yahoo Finance';
      $('market-asof').append(link, document.createTextNode(`. Last source candle: ${timeFormat.format(new Date(data.market.as_of))}${data.stale ? ' — showing cached data because refresh failed.' : ''}`));
      const coverageDate = time => dateFormat.format(typeof time === 'number' ? new Date(time * 1000) : new Date(time + 'T00:00:00Z'));
      $('chart-window').textContent = `${timeframeLabels[data.timeframe]} candles. Up to ${data.lookback_days} days of history; ${data.data.length.toLocaleString()} bars. ${coverageDate(data.coverage.from)} to ${coverageDate(data.coverage.to)}. Zoom out or drag for more.`;
      $('chart-time-note').textContent = data.aggregation
        ? `4H candles combine Yahoo 1H bars at 00:00, 04:00, 08:00, 12:00, 16:00 and 20:00 UTC. Empty periods are omitted; market closures or missing hours can shorten a bar.${data.aggregation.last_complete ? '' : ' The last bar is incomplete.'}`
        : ['1d', '1wk'].includes(data.timeframe) ? `Session dates follow Yahoo's ${data.time_zone} calendar. The current candle may still change.` : 'Chart times are UTC. The current candle may still change.';
      renderFacts(data, instrument.precision);
      try { renderChart(data, instrument); setStatus(''); } catch (error) { setStatus(error.message); }
    } catch (error) { if (id === requestId) { setStatus(error.message + ' Use Reload data to try again.'); $('chart-window').textContent = `${timeframeLabels[timeframe]} candle history unavailable.`; } }
    finally { if (id === requestId) { $('market-retry').disabled = false; $('market-chart').removeAttribute('aria-busy'); } }
  }
  async function loadCountryEconomics() {
    const id = ++economicsRequest, instrument = selected;
    const region = document.querySelector('.country-comparison');
    region.setAttribute('aria-busy', 'true');
    if ($('country-data').dataset.instrument !== instrument) $('country-data').replaceChildren();
    $('country-data').dataset.instrument = instrument;
    $('country-status').textContent = 'Loading country observations…';
    try {
      const response = await api(`${instrument}/economics`);
      if (id !== economicsRequest) return;
      $('country-data').replaceChildren();
      $('country-title').textContent = response.countries.length > 1 ? 'Policy & inflation comparison' : 'US policy & inflation';
      let unavailable = 0;
      for (const country of response.countries) {
        const column = document.createElement('article'); column.className = 'country-column'; column.dataset.country = country.code;
        const heading = document.createElement('h4'); heading.textContent = `${country.currency} · ${country.name}`;
        const bank = document.createElement('p'); bank.className = 'source-note'; bank.textContent = country.bank;
        const dl = document.createElement('dl');
        const { policy, cpi, core_cpi: core } = country;
        const series = [['Policy', policy], ['CPI', cpi], ...(core ? [['Core CPI', core]] : [])];
        unavailable += series.filter(([, item]) => item.status === 'unavailable').length;
        const figures = [['Policy benchmark', policy.value, 3], ['Previous distinct rate', policy.previous, 3], ['Headline CPI, YoY', cpi.yoy, 2], ['CPI, MoM (unadjusted)', cpi.mom, 2]];
        for (const [label, value, precision] of figures) {
          const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
          dt.textContent = label; dd.textContent = value == null ? '—' : `${number(value, precision)}%`; row.append(dt, dd); dl.append(row);
        }
        column.append(heading, bank, dl);
        if (core) {
          const coreSection = document.createElement('section'); coreSection.className = 'core-inflation'; coreSection.dataset.core = country.code;
          const coreTitle = document.createElement('h5'); coreTitle.textContent = core.name;
          const explanation = document.createElement('p'); explanation.className = 'source-note'; explanation.textContent = core.definition;
          const adjustment = code => code === 'SA' ? 'seasonally adjusted' : code === 'NSA' ? 'not seasonally adjusted' : 'not supplied';
          const frequency = document.createElement('p'); frequency.className = 'source-note'; frequency.textContent = `${core.frequency}. YoY: ${adjustment(core.yoy_adjustment)}. MoM: ${adjustment(core.mom_adjustment)}.`;
          const rateList = item => {
            const list = document.createElement('dl');
            for (const [name, value, adj] of [['YoY', item.yoy, item.yoy_adjustment], ['MoM', item.mom, item.mom_adjustment]]) {
              const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
              dt.textContent = `${name}${adj ? ` (${adj})` : ''}`; dd.textContent = value == null ? 'Unavailable' : `${number(value)}%`; row.append(dt, dd); list.append(row);
            }
            return list;
          };
          coreSection.append(coreTitle, explanation, rateList(core), frequency);
          if (core.status === 'unavailable') {
            const unavailable = document.createElement('p'); unavailable.className = 'source-note'; unavailable.textContent = 'No saved observation available. The source could not supply a usable series; no substitute value is shown.'; coreSection.append(unavailable);
          }
          if (core.alternatives?.length) {
            const alternatives = document.createElement('details'); alternatives.className = 'core-alternatives';
            const summary = document.createElement('summary'); summary.textContent = 'Other inflation measures'; alternatives.append(summary);
            core.alternatives.forEach(item => {
              const article = document.createElement('article'), title = document.createElement('h6'), note = document.createElement('p'), asof = document.createElement('p');
              title.textContent = item.name; note.className = asof.className = 'source-note'; note.textContent = item.definition;
              asof.textContent = `${item.frequency}. Observation: ${item.period || 'Unavailable'}. YoY: ${adjustment(item.yoy_adjustment)}. MoM: ${adjustment(item.mom_adjustment)}.${core.status === 'stale' ? ' Cached data.' : ''}`;
              const link = document.createElement('a'); link.href = item.source_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = ' Source'; asof.append(link);
              article.append(title, note, rateList(item), asof); alternatives.append(article);
            });
            coreSection.append(alternatives);
          }
          column.append(coreSection);
        }
        for (const [label, item] of series) {
          const note = document.createElement('p'); note.className = 'source-note';
          note.textContent = item.period ? `${label} observation: ${item.period}${item.status === 'stale' ? ' — cached; refresh pending or unavailable' : ''}.` : `${label}: no saved observation available.`;
          column.append(note);
        }
        const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'Sources & definitions'; details.append(summary);
        for (const [label, item] of series) {
          if (!item.source_url) continue;
          const p = document.createElement('p'); p.className = 'source-note';
          const a = document.createElement('a'); a.href = item.source_url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = `${label}: ${item.provider || 'BIS'}`;
          p.append(a, document.createTextNode(`. ${item.publisher}. ${item.definition}${item.fetched_at ? ` Retrieved: ${timeFormat.format(new Date(item.fetched_at))}.` : ' No saved observation available.'}`));
          if (item.yoy_source_url) {
            const yoyLink = document.createElement('a'); yoyLink.href = item.yoy_source_url; yoyLink.target = '_blank'; yoyLink.rel = 'noopener noreferrer'; yoyLink.textContent = ' YoY source (NSA)'; p.append(yoyLink);
          }
          if (label === 'Policy') p.append(document.createTextNode(item.last_change_period ? ` Last observed change: ${item.last_change_period}; previous observation: ${item.previous_period}.` : ' No distinct prior rate found in the saved window.'));
          details.append(p);
        }
        column.append(details); $('country-data').append(column);
      }
      $('country-status').textContent = `${response.countries.length === 1 ? 'US context for this commodity. ' : ''}${unavailable ? `${unavailable} series unavailable. ` : ''}${response.refreshing ? 'Showing saved observations while checking for updates. ' : ''}${response.persistence === 'mysql' ? 'Saved in MySQL. ' : 'Database persistence unavailable; observations may only be in memory. '}Source checks are cached for six hours.`;
    } catch (error) {
      if (id === economicsRequest) $('country-status').textContent = 'Country observations could not be refreshed. Any displayed observations are retained. Use Reload economics to retry.';
    } finally { if (id === economicsRequest) region.setAttribute('aria-busy', 'false'); }
  }
  async function loadMacro() {
    $('macro-retry').disabled = true; $('macro-status').textContent = 'Loading FRED observations…';
    try {
      const response = await api('macro');
      const labels = { DFF: 'Effective Fed funds', CPIAUCSL: 'CPI YoY (SA)', DGS10: '10-year US yield', DFII10: '10-year real yield', DTWEXBGS: 'US dollar index' };
      $('macro-data').replaceChildren(...response.data.map(item => {
        const tr = document.createElement('tr'), name = document.createElement('td'), value = document.createElement('td'), date = document.createElement('td');
        const link = document.createElement('a'); link.href = item.source_url; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = labels[item.id] || item.name;
        link.title = `${item.name}. ${item.publisher}. ${item.frequency}.${item.calculation ? ' ' + item.calculation : ''}`;
        name.append(link); value.textContent = item.value == null ? 'Unavailable' : `${number(item.value)}${item.unit === '%' ? '%' : ''}${item.stale ? ' (cached)' : ''}`;
        date.textContent = item.observation_date ? dateFormat.format(new Date(item.observation_date + 'T00:00:00Z')) : '—';
        tr.append(name, value, date); return tr;
      }));
      const missing = response.data.filter(item => item.status === 'unavailable').length;
      $('macro-status').textContent = missing ? `${missing} economic series unavailable. Other observations remain available.` : 'FRED observations cached for one hour. Index base: January 2006 = 100.';
    } catch (error) {
      if ($('macro-data').textContent.includes('Loading economic data')) $('macro-data').firstElementChild.firstElementChild.textContent = 'Economic observations unavailable.';
      $('macro-status').textContent = 'Economic data could not be refreshed. Any previously displayed observations are retained.';
    }
    finally { $('macro-retry').disabled = false; }
  }
  $('instrument-select').addEventListener('change', event => { selected = event.target.value; loadMarket(); });
  $('market-timeframes').addEventListener('click', event => { const button = event.target.closest('[data-timeframe]'); if (button && button.dataset.timeframe !== timeframe) { timeframe = button.dataset.timeframe; loadMarket(); } });
  $('market-retry').addEventListener('click', loadMarket);
  $('macro-retry').addEventListener('click', () => { loadMacro(); loadCountryEconomics(); });
  loadMacro();
  try {
    const response = await api('instruments'); instruments = response.data;
    if (!instruments.some(item => item.id === selected)) selected = 'eurusd';
    renderInstruments(); loadMarket();
  } catch (error) { setStatus('Instrument list could not be loaded. Reload the page to retry.'); }
})();

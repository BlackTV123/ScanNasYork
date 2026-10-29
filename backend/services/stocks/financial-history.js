/** Only treat a series as present when both chart metrics have saved values. */
function hasFinancialHistory(data) {
  return ['annual', 'quarterly'].every(period =>
    Array.isArray(data?.[period]) && ['revenue', 'eps'].every(field =>
      data[period].some(row => row[field] != null && Number.isFinite(Number(row[field])))
    )
  );
}

function yahooStatements(symbol, annual, quarterly, currency, cutoff) {
  if (!/^[A-Z]{3}$/.test(currency || '')) throw new Error('Yahoo financial reporting currency unavailable');
  const validDate = row => row.date instanceof Date && Number.isFinite(row.date.getTime());
  const annualDates = annual.filter(row => validDate(row) && (!row.periodType || row.periodType === '12M')).sort((a, b) => b.date - a.date);
  if (!annualDates.length && quarterly.length) throw new Error('Cannot determine fiscal year end from Yahoo annual history');
  const anchor = annualDates[0]?.date;
  const monthPosition = date => date.getUTCFullYear() * 12 + date.getUTCMonth() + date.getUTCDate() / 31;
  const number = value => value != null && Number.isFinite(value) ? value : null;
  return [['Annual', annual], ['Quarterly', quarterly]].flatMap(([period, rows]) => rows.filter(row =>
    validDate(row) && (!row.periodType || row.periodType === (period === 'Annual' ? '12M' : '3M'))
  ).map(row => {
    // Nearest fiscal quarter tolerates 52/53-week year ends crossing a month boundary.
    const quarterIndex = anchor ? anchor.getUTCFullYear() * 4 + 3 + Math.round((monthPosition(row.date) - monthPosition(anchor)) / 3) : 0;
    return {
      symbol, period_type: period,
      fiscal_year: period === 'Annual' ? row.date.getUTCFullYear() : Math.floor(quarterIndex / 4),
      fiscal_period: period === 'Annual' ? 'FY' : `Q${quarterIndex % 4 + 1}`,
      report_date: row.date.toISOString().slice(0, 10), currency,
      revenue: number(row.totalRevenue), net_income: number(row.netIncome),
      eps: number(row.dilutedEPS ?? row.basicEPS), source_api: 'yahoo_finance',
    };
  })).filter(row => row.fiscal_year >= cutoff && [row.revenue, row.net_income, row.eps].some(v => v != null));
}

/** SEC wins overlapping periods. Never combine amounts in different currencies. */
function mergeStatements(existing, incoming) {
  const key = row => `${row.fiscal_year}:${row.fiscal_period}`;
  const records = new Map(existing.map(row => [key(row), row]));
  const changed = new Map();
  for (const row of incoming) {
    const previous = records.get(key(row));
    if (previous?.source_api === 'sec_edgar' && row.source_api !== 'sec_edgar' && previous.currency !== row.currency) continue;
    const merged = !previous || previous.currency !== row.currency ? { ...row } : { ...previous };
    if (previous && previous.currency === row.currency) {
      for (const field of ['revenue', 'net_income', 'eps']) {
        if (row[field] != null && (row.source_api === 'sec_edgar' || previous.source_api !== 'sec_edgar' || previous[field] == null)) merged[field] = row[field];
      }
      if (row.source_api === 'sec_edgar' || previous.source_api !== 'sec_edgar') {
        merged.source_api = row.source_api;
        merged.report_date = row.report_date;
      }
    }
    const clean = Object.fromEntries(['symbol', 'period_type', 'fiscal_year', 'fiscal_period', 'revenue', 'net_income', 'eps', 'report_date', 'currency', 'source_api'].map(field => [field, merged[field]]));
    records.set(key(row), clean);
    changed.set(key(row), clean);
  }
  return [...changed.values()];
}

module.exports = { hasFinancialHistory, yahooStatements, mergeStatements };

const { buildForecastResponse } = require('./forecast-data');
const { hasFinancialHistory, yahooStatements, mergeStatements } = require('./financial-history');

function createStockSources({ yahoo, ticker, incomeStatement, sequelize, sec, now = Date.now }) {
  const summaries = new Map();
  function companySummary(symbol) {
    const entry = summaries.get(symbol);
    if (entry && now() - entry.time < 60000) return entry.promise;
    const promise = yahoo.quoteSummary(symbol, { modules: [
      'price', 'summaryDetail', 'summaryProfile', 'financialData', 'defaultKeyStatistics', 'assetProfile',
      'earningsTrend', 'earnings',
    ] }).catch(error => { summaries.delete(symbol); throw error; });
    summaries.set(symbol, { time: now(), promise });
    if (summaries.size > 100) summaries.delete(summaries.keys().next().value);
    return promise;
  }
  return {
    async fundamentals(symbol) {
      const summary = await companySummary(symbol);
      if (!summary || !Object.keys(summary).length) throw new Error('Yahoo returned no company data');
      const price = summary.price || {};
      const profile = { ...summary.summaryProfile, ...summary.assetProfile };
      const stats = summary.defaultKeyStatistics || {};
      const financials = summary.financialData || {};
      const percent = value => value == null ? undefined : Number((value * 100).toFixed(2));
      const fields = {
        company_name: price.longName || price.shortName,
        sector: profile.sector, industry: profile.industry,
        description: profile.longBusinessSummary, market_cap: price.marketCap,
        pe_ratio: summary.summaryDetail?.trailingPE,
        ttm_eps: stats.trailingEps, ttm_net_income: stats.netIncomeToCommon,
        ttm_revenue: financials.totalRevenue,
        latest_eps_yoy_growth: percent(financials.earningsGrowth),
        revenue_yoy_growth: percent(financials.revenueGrowth),
        target_mean_price: financials.targetMeanPrice,
      };
      // Partial upstream fields must not erase previously saved information.
      const update = Object.fromEntries(Object.entries(fields).filter(([, value]) => value != null));
      if (!Object.keys(update).length) throw new Error('Yahoo returned no usable company fields');
      update.last_fundamental_update = new Date(now());
      await ticker.update(update, { where: { symbol } });
      return buildForecastResponse(symbol, summary);
    },

    async financials(symbol) {
      const existing = await incomeStatement.findAll({ where: { symbol }, raw: true });
      const saved = {
        annual: existing.filter(row => row.period_type === 'Annual'),
        quarterly: existing.filter(row => row.period_type === 'Quarterly'),
      };
      const cutoff = new Date(now()).getUTCFullYear() - 8;
      const since = `${cutoff}-01-01`;
      const fromSec = async () => {
        const mapping = await sec.getCikMapping();
        if (!mapping[symbol]) return [];
        const statements = await sec.fetchSecIncomeStatements(mapping[symbol]);
        return statements.filter(row => row.fiscal_year >= cutoff).map(row => ({
          symbol, period_type: row.fiscal_period === 'FY' ? 'Annual' : 'Quarterly',
          fiscal_year: row.fiscal_year, fiscal_period: row.fiscal_period,
          revenue: row.revenue ?? null, net_income: row.net_income ?? null,
          eps: row.eps ?? null, report_date: row.report_date, currency: 'USD', source_api: 'sec_edgar',
        }));
      };
      const fromYahoo = async () => {
        // Keep a successful period when the other Yahoo request fails.
        const [summary, periods] = await Promise.all([
          companySummary(symbol),
          Promise.allSettled(['annual', 'quarterly'].map(type =>
            yahoo.fundamentalsTimeSeries(symbol, { period1: since, type, module: 'financials' }))),
        ]);
        if (periods.every(result => result.status === 'rejected')) throw new AggregateError(periods.map(result => result.reason), 'Yahoo history requests failed');
        const [annual, quarterly] = periods.map(result => result.status === 'fulfilled' ? result.value : []);
        const fiscalReference = annual.length ? annual : existing.filter(row => row.period_type === 'Annual').map(row => ({ date: new Date(row.report_date) }));
        return yahooStatements(symbol, fiscalReference, quarterly, summary.financialData?.financialCurrency, cutoff);
      };
      // When history is missing, start both providers immediately for this stock.
      let secResult, yahooResult;
      if (!hasFinancialHistory(saved)) {
        [secResult, yahooResult] = await Promise.allSettled([fromSec(), fromYahoo()]);
      } else {
        [secResult] = await Promise.allSettled([fromSec()]);
        if (secResult.status === 'rejected' || !secResult.value.length) {
          [yahooResult] = await Promise.allSettled([fromYahoo()]);
        }
      }
      const providers = {};
      for (const [name, result] of [['sec_financials', secResult], ['yahoo_financials', yahooResult]]) {
        if (result) providers[name] = { status: result.status === 'rejected' ? 'failed' : result.value.length ? 'updated' : 'unavailable' };
      }
      const value = result => result?.status === 'fulfilled' ? result.value : [];
      // Merge Yahoo first, then SEC so official same-period records take priority.
      const rows = mergeStatements(existing, [...value(yahooResult), ...value(secResult)]);
      if (rows.length) {
        await sequelize.transaction(async transaction => {
          await incomeStatement.bulkCreate(rows, {
            updateOnDuplicate: ['revenue', 'net_income', 'eps', 'report_date', 'currency', 'source_api'], transaction,
          });
          const annual = await incomeStatement.findAll({
            where: { symbol, period_type: 'Annual' }, order: [['fiscal_year', 'DESC']], raw: true, transaction,
          });
          let streak = 0;
          const withRevenue = annual.filter(row => row.revenue != null);
          for (let i = 0; i < withRevenue.length - 1; i++) {
            if (withRevenue[i].currency !== withRevenue[i + 1].currency || BigInt(withRevenue[i].revenue) <= BigInt(withRevenue[i + 1].revenue)) break;
            streak++;
          }
          await ticker.update({ revenue_consecutive_years: streak,
            ...(value(secResult).length ? { last_sec_update: new Date(now()) } : {}),
          }, { where: { symbol }, transaction });
        });
      }
      if (!rows.length && Object.values(providers).every(provider => provider.status === 'failed')) {
        throw new AggregateError([secResult.reason, yahooResult?.reason].filter(Boolean), 'Both financial history providers failed');
      }
      return { status: rows.length ? 'updated' : 'unavailable', statements: rows.length, providers };
    },
  };
}

module.exports = { createStockSources };

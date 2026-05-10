/**
 * Stock Controller — Sequelize ORM Version
 */

const { Op, fn, col, literal } = require('sequelize');
const { Ticker, DailyMetric, IncomeStatement, sequelize } = require('../../models');
const logger = require('../../utils/logger');

// Simple in-memory cache
const cache = new Map();
function getCached(key, ttlMs = 300000) {
  const e = cache.get(key);
  if (e && Date.now() - e.ts < ttlMs) return e.data;
  return null;
}
function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) { if (now - v.ts > 600000) cache.delete(k); }
  }
}

// ════════════════════════════════════
// GET /stocks/screen
// ════════════════════════════════════
async function screenStocks(req, res) {
  const start = Date.now();
  try {
    const f = req.query;
    const cacheKey = `screen:${JSON.stringify(f)}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json({ ...cached, cached: true, execution_time_ms: Date.now() - start });

    // Build Ticker WHERE conditions
    const tickerWhere = {};
    if (f.eps_min !== undefined) tickerWhere.ttm_eps = { ...tickerWhere.ttm_eps, [Op.gte]: parseFloat(f.eps_min) };
    if (f.eps_max !== undefined) tickerWhere.ttm_eps = { ...tickerWhere.ttm_eps, [Op.lte]: parseFloat(f.eps_max) };
    if (f.revenue_min !== undefined) tickerWhere.ttm_revenue = { ...tickerWhere.ttm_revenue, [Op.gte]: parseFloat(f.revenue_min) * 1e6 };
    if (f.revenue_max !== undefined) tickerWhere.ttm_revenue = { ...tickerWhere.ttm_revenue, [Op.lte]: parseFloat(f.revenue_max) * 1e6 };
    if (f.pe_ratio_min !== undefined) tickerWhere.pe_ratio = { ...tickerWhere.pe_ratio, [Op.gte]: parseFloat(f.pe_ratio_min) };
    if (f.pe_ratio_max !== undefined) tickerWhere.pe_ratio = { ...tickerWhere.pe_ratio, [Op.lte]: parseFloat(f.pe_ratio_max) };
    if (f.eps_yoy_growth_min !== undefined) tickerWhere.latest_eps_yoy_growth = { [Op.gte]: parseFloat(f.eps_yoy_growth_min) };
    if (f.market_cap_min !== undefined) tickerWhere.market_cap = { ...tickerWhere.market_cap, [Op.gte]: parseFloat(f.market_cap_min) };
    if (f.market_cap_max !== undefined) tickerWhere.market_cap = { ...tickerWhere.market_cap, [Op.lte]: parseFloat(f.market_cap_max) };
    if (f.sector) tickerWhere.sector = f.sector;
    if (f.search) {
      tickerWhere[Op.or] = [
        { symbol: { [Op.iLike]: `%${f.search}%` } },
        { company_name: { [Op.iLike]: `%${f.search}%` } }
      ];
    }

    // Build DailyMetric WHERE conditions
    const metricWhere = {};
    if (f.rsi_min !== undefined) metricWhere.rsi_14 = { ...metricWhere.rsi_14, [Op.gte]: parseFloat(f.rsi_min) };
    if (f.rsi_max !== undefined) metricWhere.rsi_14 = { ...metricWhere.rsi_14, [Op.lte]: parseFloat(f.rsi_max) };
    if (f.macd_positive === 'true' || f.macd_positive === true) metricWhere.macd = { [Op.gt]: 0 };

    const limit = parseInt(f.limit, 10) || 50;
    const offset = parseInt(f.offset, 10) || 0;

    // Sort mapping
    const sort_by = f.sort_by || 'symbol';
    const sort_order = f.sort_order || 'ASC';

    // We use Sequelize.literal to force NULLS LAST behavior in PostgreSQL
    const order = [sequelize.literal(`"${sort_by}" ${sort_order} NULLS LAST`)];

    // For technical filters, we need a subquery approach
    // First get symbols matching metric filters, then filter tickers
    let symbolFilter = null;
    if (Object.keys(metricWhere).length > 0) {
      // Get latest metric per symbol that matches filters
      const extraWhere = { ...metricWhere };
      // Get latest date with metrics
      const latestMetrics = await DailyMetric.findAll({
        attributes: ['symbol'],
        where: extraWhere,
        group: ['symbol'],
        raw: true,
      });
      symbolFilter = latestMetrics.map(m => m.symbol);

      if (symbolFilter.length === 0) {
        return res.json({
          success: true, data: [],
          pagination: { total_results: 0, returned: 0, limit, offset, pages: 0 },
          execution_time_ms: Date.now() - start,
        });
      }
      tickerWhere.symbol = { [Op.in]: symbolFilter };
    }

    // Count + Fetch in parallel
    const [total, tickers] = await Promise.all([
      Ticker.count({ where: tickerWhere }),
      Ticker.findAll({
        attributes: [
          'symbol', 'company_name', 'sector', 'industry', 
          'market_cap', 'current_price', 'price_change_pct', 
          'ttm_eps', 'ttm_revenue', 'pe_ratio', 'latest_eps_yoy_growth',
          'rsi_14', 'macd'
        ],
        where: tickerWhere,
        order,
        limit,
        offset,
        raw: true,
      }),
    ]);

    // Fetch latest metrics for the returned tickers
    const symbols = tickers.map(t => t.symbol);
    let metricsMap = {};

    if (symbols.length > 0) {
      // Get the latest metric row per symbol using a subquery
      const latestDates = await sequelize.query(`
        SELECT DISTINCT ON (symbol) symbol, date, rsi_14, rsi_14_ma, rsi_14_bb_upper, rsi_14_bb_lower, rsi_7, macd, macd_signal,
               macd_histogram, volume, close
        FROM daily_metrics
        WHERE symbol IN (:symbols)
        ORDER BY symbol, date DESC
      `, {
        replacements: { symbols },
        type: sequelize.constructor.QueryTypes.SELECT,
      });

      for (const m of latestDates) {
        metricsMap[m.symbol] = m;
      }
    }

    // Merge ticker + metrics
    const data = tickers.map(t => {
      const m = metricsMap[t.symbol] || {};
      return {
        symbol: t.symbol,
        company_name: t.company_name,
        sector: t.sector,
        industry: t.industry,
        market_cap: t.market_cap,
        current_price: t.current_price,
        price_change_pct: t.price_change_pct,
        ttm_eps: t.ttm_eps,
        ttm_revenue: t.ttm_revenue,
        ttm_net_income: t.ttm_net_income,
        latest_eps_yoy_growth: t.latest_eps_yoy_growth,
        pe_ratio: t.pe_ratio,
        rsi_14: m.rsi_14 || null,
        rsi_14_ma: m.rsi_14_ma || null,
        rsi_14_bb_upper: m.rsi_14_bb_upper || null,
        rsi_14_bb_lower: m.rsi_14_bb_lower || null,
        rsi_7: m.rsi_7 || null,
        macd: m.macd || null,
        macd_signal: m.macd_signal || null,
        macd_histogram: m.macd_histogram || null,
        volume: m.volume || null,
        close: m.close || null,
        metrics_date: m.date || null,
      };
    });

    const response = {
      success: true,
      data,
      pagination: { total_results: total, returned: data.length, limit, offset, pages: Math.ceil(total / limit) },
      execution_time_ms: Date.now() - start,
    };

    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    logger.error('Screen query failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ════════════════════════════════════
// GET /stocks/:symbol
// ════════════════════════════════════
async function getStockDetail(req, res) {
  try {
    const symbol = req.params.symbol.toUpperCase();

    const [ticker, latestMetric, quarterly, annual] = await Promise.all([
      Ticker.findOne({ where: { symbol }, raw: true }),
      DailyMetric.findOne({ where: { symbol }, order: [['date', 'DESC']], raw: true }),
      IncomeStatement.findAll({
        where: { symbol, period_type: 'Quarterly' },
        order: [['fiscal_year', 'DESC'], ['fiscal_period', 'DESC']],
        limit: 32,
        raw: true,
      }),
      IncomeStatement.findAll({
        where: { symbol, period_type: 'Annual' },
        order: [['fiscal_year', 'DESC']],
        limit: 8,
        raw: true,
      }),
    ]);

    if (!ticker) return res.status(404).json({ success: false, error: 'Stock not found' });

    res.json({
      success: true,
      data: {
        symbol: ticker.symbol,
        company_name: ticker.company_name,
        sector: ticker.sector,
        industry: ticker.industry,
        market_cap: ticker.market_cap,
        current_metrics: latestMetric ? {
          price: latestMetric.close,
          rsi_14: latestMetric.rsi_14,
          rsi_14_ma: latestMetric.rsi_14_ma,
          rsi_14_bb_upper: latestMetric.rsi_14_bb_upper,
          rsi_14_bb_lower: latestMetric.rsi_14_bb_lower,
          rsi_7: latestMetric.rsi_7,
          macd: latestMetric.macd,
          macd_signal: latestMetric.macd_signal,
          macd_histogram: latestMetric.macd_histogram,
          volume: latestMetric.volume,
          bb_upper: latestMetric.bb_upper,
          bb_lower: latestMetric.bb_lower,
          atr_14: latestMetric.atr_14,
          date: latestMetric.date,
        } : null,
        fundamentals: {
          ttm_revenue: ticker.ttm_revenue,
          ttm_eps: ticker.ttm_eps,
          ttm_net_income: ticker.ttm_net_income,
          pe_ratio: ticker.pe_ratio,
          latest_eps_yoy_growth: ticker.latest_eps_yoy_growth,
        },
        annual_history: annual.map(a => ({
          fiscal_year: a.fiscal_year,
          fiscal_period: a.fiscal_period,
          revenue: a.revenue,
          eps: a.eps,
          net_income: a.net_income,
          report_date: a.report_date,
        })),
        quarterly_history: quarterly.map(q => ({
          fiscal_year: q.fiscal_year,
          fiscal_period: `${q.fiscal_period} ${q.fiscal_year}`,
          revenue: q.revenue,
          eps: q.eps,
          net_income: q.net_income,
          report_date: q.report_date,
        })),
      },
    });
  } catch (err) {
    logger.error('Stock detail failed', { error: err.message, symbol: req.params.symbol });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ════════════════════════════════════
// GET /stocks/:symbol/history
// ════════════════════════════════════
async function getStockHistory(req, res) {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const days = parseInt(req.query.days, 10) || 30;

    const rows = await DailyMetric.findAll({
      where: { symbol },
      order: [['date', 'DESC']],
      limit: days,
      raw: true,
    });

    res.json({
      success: true,
      symbol,
      days,
      data: rows.reverse(),
    });
  } catch (err) {
    logger.error('Stock history failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ════════════════════════════════════
// GET /stocks/sectors
// ════════════════════════════════════
async function getSectors(req, res) {
  try {
    const sectors = await Ticker.findAll({
      attributes: [[fn('DISTINCT', col('sector')), 'sector']],
      where: { sector: { [Op.ne]: null } },
      order: [['sector', 'ASC']],
      raw: true
    });
    res.json({ success: true, data: sectors.map(s => s.sector) });
  } catch (err) {
    logger.error('Failed to fetch sectors', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * GET /stocks/:symbol/financial-chart
 * Mega Prompt Version: Actual Only, Chronological Sorting, Zero Data Loss
 */
async function getFinancialChartData(req, res) {
  try {
    const symbol = req.params.symbol.toUpperCase();
    
    // Fetch both Annual and Quarterly data
    const [quarterly, annual] = await Promise.all([
      IncomeStatement.findAll({
        where: { symbol, period_type: 'Quarterly' },
        order: [['fiscal_year', 'ASC'], ['fiscal_period', 'ASC']],
        raw: true,
      }),
      IncomeStatement.findAll({
        where: { symbol, period_type: 'Annual' },
        order: [['fiscal_year', 'ASC']],
        raw: true,
      }),
    ]);

    // Zero Data Loss Logic: Mapping and Sorting (Oldest to Newest)
    const quarterlyData = quarterly.map(q => ({
      period: `${q.fiscal_period} ${q.fiscal_year}`,
      revenue: q.revenue !== null ? parseFloat(q.revenue) : null,
      eps: q.eps !== null ? parseFloat(q.eps) : null,
      sortKey: `${q.fiscal_year}-${q.fiscal_period}`
    }));

    const annualData = annual.map(a => ({
      period: `${a.fiscal_year}`,
      revenue: a.revenue !== null ? parseFloat(a.revenue) : null,
      eps: a.eps !== null ? parseFloat(a.eps) : null,
      sortKey: `${a.fiscal_year}`
    }));

    // Log array lengths for debug as requested
    console.log(`[DEBUG] Financial Chart Data for ${symbol}: Quarterly=${quarterlyData.length}, Annual=${annualData.length}`);

    res.json({
      success: true,
      symbol,
      data: {
        quarterly: quarterlyData,
        annual: annualData
      }
    });
  } catch (err) {
    logger.error('Financial chart API failed', { error: err.message, symbol: req.params.symbol });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

module.exports = { screenStocks, getStockDetail, getStockHistory, getSectors, getFinancialChartData };

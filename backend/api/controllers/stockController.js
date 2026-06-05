/**
 * Stock Controller — Hybrid Architecture Version
 * 
 * Changes:
 * - screenStocks(): reads technical data directly from Tickers (no DailyMetric JOIN)
 * - getStockDetail(): reads technical data from Tickers
 * - getChartData(): NEW — on-demand candlestick data from Yahoo Finance
 * - getForecast(): NEW — analyst forecast/estimates from Yahoo Finance
 * - getStockHistory(): REMOVED (deprecated with Daily_Metrics)
 */

const { Op, fn, col, literal } = require('sequelize');
const { Ticker, IncomeStatement, sequelize } = require('../../models');
const logger = require('../../utils/logger');

// Yahoo Finance for on-demand data
const YahooFinance = require('yahoo-finance2').default;
const yf = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

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
// Timeframe → Yahoo period mapping (Native Only)
// ทุกตัวเลือกจะดึงตั้งแต่วันแรกที่เปิดตลาด (1970-01-01)
// ════════════════════════════════════
const RANGE_MAP = {
  '1d':  { interval: '1d'  }, // แท่ง 1 วัน
  '1w':  { interval: '1wk' }, // แท่ง 1 สัปดาห์
  '1m':  { interval: '1mo' }, // แท่ง 1 เดือน
  '3m':  { interval: '3mo' }  // แท่ง 3 เดือน (Timeframe ใหญ่สุดของ Yahoo)
};

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

    // Build Ticker WHERE conditions (all filters now on Tickers directly!)
    const tickerWhere = {};

    // Fundamental filters
    if (f.eps_min !== undefined) tickerWhere.ttm_eps = { ...tickerWhere.ttm_eps, [Op.gte]: parseFloat(f.eps_min) };
    if (f.eps_max !== undefined) tickerWhere.ttm_eps = { ...tickerWhere.ttm_eps, [Op.lte]: parseFloat(f.eps_max) };
    if (f.revenue_min !== undefined) tickerWhere.ttm_revenue = { ...tickerWhere.ttm_revenue, [Op.gte]: parseFloat(f.revenue_min) };
    if (f.revenue_max !== undefined) tickerWhere.ttm_revenue = { ...tickerWhere.ttm_revenue, [Op.lte]: parseFloat(f.revenue_max) };
    if (f.rev_growth_min !== undefined) tickerWhere.revenue_yoy_growth = { [Op.gte]: parseFloat(f.rev_growth_min) };
    if (f.rev_consecutive_years !== undefined) tickerWhere.revenue_consecutive_years = { [Op.gte]: parseInt(f.rev_consecutive_years, 10) };
    if (f.upside_min !== undefined) {
      tickerWhere[Op.and] = tickerWhere[Op.and] || [];
      tickerWhere[Op.and].push(
        sequelize.literal(`("current_price" > 0 AND "target_mean_price" > "current_price" AND (("target_mean_price" - "current_price") / "current_price" * 100) >= ${parseFloat(f.upside_min)})`)
      );
    }
    if (f.pe_ratio_min !== undefined) tickerWhere.pe_ratio = { ...tickerWhere.pe_ratio, [Op.gte]: parseFloat(f.pe_ratio_min) };
    if (f.pe_ratio_max !== undefined) tickerWhere.pe_ratio = { ...tickerWhere.pe_ratio, [Op.lte]: parseFloat(f.pe_ratio_max) };
    if (f.eps_yoy_growth_min !== undefined) tickerWhere.latest_eps_yoy_growth = { [Op.gte]: parseFloat(f.eps_yoy_growth_min) };
    if (f.market_cap_min !== undefined) tickerWhere.market_cap = { ...tickerWhere.market_cap, [Op.gte]: parseFloat(f.market_cap_min) };
    if (f.market_cap_max !== undefined) tickerWhere.market_cap = { ...tickerWhere.market_cap, [Op.lte]: parseFloat(f.market_cap_max) };
    if (f.sector) tickerWhere.sector = f.sector;
    if (f.favorites_only === 'true' || f.favorites_only === true) {
      tickerWhere.is_favorite = true;
    }

    // Technical filters — now directly on Tickers!
    if (f.rsi_min !== undefined) tickerWhere.rsi_14 = { ...tickerWhere.rsi_14, [Op.gte]: parseFloat(f.rsi_min) };
    if (f.rsi_max !== undefined) tickerWhere.rsi_14 = { ...tickerWhere.rsi_14, [Op.lte]: parseFloat(f.rsi_max) };
    if (f.macd_positive === 'true' || f.macd_positive === true) tickerWhere.macd = { [Op.gt]: 0 };

    if (f.building_base === 'true' || f.building_base === true) {
      // Bollinger Bandwidth <= 5% (ราคาบีบตัวแน่น สร้างฐาน)
      tickerWhere[Op.and] = tickerWhere[Op.and] || [];
      tickerWhere[Op.and].push(
        sequelize.literal('("bb_middle" > 0 AND ("bb_upper" - "bb_lower") / "bb_middle" <= 0.05)')
      );
    }

    // Search
    if (f.search) {
      tickerWhere[Op.or] = [
        { symbol: { [Op.iLike]: `%${f.search}%` } },
        { company_name: { [Op.iLike]: `%${f.search}%` } }
      ];
    }

    const limit = parseInt(f.limit, 10) || 50;
    const offset = parseInt(f.offset, 10) || 0;

    // Sort mapping
    const sort_by = f.sort_by || 'symbol';
    const sort_order = f.sort_order || 'ASC';
    const order = [sequelize.literal(`"${sort_by}" ${sort_order} NULLS LAST`)];

    // Count + Fetch in parallel — NO MORE DailyMetric JOIN!
    const [total, tickers] = await Promise.all([
      Ticker.count({ where: tickerWhere }),
      Ticker.findAll({
        attributes: [
          'symbol', 'company_name', 'sector', 'industry',
          'market_cap', 'current_price', 'price_change_pct', 'volume',
          'target_mean_price', 'ttm_eps', 'ttm_revenue', 'revenue_yoy_growth', 'revenue_consecutive_years', 'pe_ratio', 'latest_eps_yoy_growth',
          'rsi_14', 'rsi_7', 'macd', 'macd_signal', 'macd_histogram',
          'bb_upper', 'bb_middle', 'bb_lower', 'atr_14',
          'is_favorite', 'last_technical_update'
        ],
        where: tickerWhere,
        order,
        limit,
        offset,
        raw: true,
      }),
    ]);

    const data = tickers.map(t => ({
      symbol: t.symbol,
      company_name: t.company_name,
      sector: t.sector,
      industry: t.industry,
      market_cap: t.market_cap,
      current_price: t.current_price,
      target_mean_price: t.target_mean_price,
      price_change_pct: t.price_change_pct,
      volume: t.volume,
      ttm_eps: t.ttm_eps,
      ttm_revenue: t.ttm_revenue,
      revenue_yoy_growth: t.revenue_yoy_growth,
      revenue_consecutive_years: t.revenue_consecutive_years,
      ttm_net_income: t.ttm_net_income,
      latest_eps_yoy_growth: t.latest_eps_yoy_growth,
      pe_ratio: t.pe_ratio,
      rsi_14: t.rsi_14,
      rsi_7: t.rsi_7,
      macd: t.macd,
      macd_signal: t.macd_signal,
      macd_histogram: t.macd_histogram,
      bb_upper: t.bb_upper,
      bb_middle: t.bb_middle,
      bb_lower: t.bb_lower,
      atr_14: t.atr_14,
      is_favorite: t.is_favorite === true || t.is_favorite === 1 || t.is_favorite === 'true',
      metrics_date: t.last_technical_update,
    }));

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

    const [ticker, quarterly, annual] = await Promise.all([
      Ticker.findOne({ where: { symbol }, raw: true }),
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
        description: ticker.description,
        sector: ticker.sector,
        industry: ticker.industry,
        market_cap: ticker.market_cap,
        is_favorite: ticker.is_favorite === true || ticker.is_favorite === 1 || ticker.is_favorite === 'true',
        // Technical data now comes directly from Tickers
        current_metrics: {
          price: ticker.current_price,
          price_change_pct: ticker.price_change_pct,
          volume: ticker.volume,
          rsi_14: ticker.rsi_14,
          rsi_7: ticker.rsi_7,
          macd: ticker.macd,
          macd_signal: ticker.macd_signal,
          macd_histogram: ticker.macd_histogram,
          bb_upper: ticker.bb_upper,
          bb_middle: ticker.bb_middle,
          bb_lower: ticker.bb_lower,
          atr_14: ticker.atr_14,
          date: ticker.last_technical_update,
        },
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
// GET /stocks/:symbol/chart
// On-demand candlestick data from Yahoo Finance
// ════════════════════════════════════
async function getChartData(req, res) {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const range = (req.query.range || '1d').toLowerCase(); // Default เป็น 1D

    const rangeConfig = RANGE_MAP[range];
    if (!rangeConfig) {
      return res.status(400).json({
        success: false,
        error: `Invalid timeframe. Valid: ${Object.keys(RANGE_MAP).join(', ')}`
      });
    }

    // Check cache
    const cacheKey = `chart:${symbol}:${range}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    // 💡 ดึงตั้งแต่วันแรกที่เปิดตลาดเสมอ
    const period1Str = '1970-01-01'; 

    const result = await yf.chart(symbol, {
      period1: period1Str,
      interval: rangeConfig.interval,
    });

    if (!result || !result.quotes || result.quotes.length === 0) {
      return res.status(404).json({ success: false, error: 'No chart data available' });
    }

    // ฟอร์แมตข้อมูลส่งกลับไปให้ Lightweight Charts
    const data = result.quotes
      .filter(q => q.open != null && q.close != null)
      .map(q => {
        return {
          time: q.date.toISOString().split('T')[0], // วันที่ YYYY-MM-DD
          open: parseFloat(q.open.toFixed(2)),
          high: parseFloat(q.high.toFixed(2)),
          low: parseFloat(q.low.toFixed(2)),
          close: parseFloat(q.close.toFixed(2)),
          volume: q.volume || 0,
        };
      });

    const response = {
      success: true,
      symbol,
      range,
      interval: rangeConfig.interval,
      data,
    };

    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    logger.error('Chart data failed', { error: err.message, symbol: req.params.symbol });
    res.status(500).json({ success: false, error: 'Failed to fetch chart data' });
  }
}

// ════════════════════════════════════
// GET /stocks/:symbol/forecast
// On-demand analyst forecast from Yahoo Finance
// ════════════════════════════════════
async function getForecast(req, res) {
  try {
    const symbol = req.params.symbol.toUpperCase();

    // Check cache first (10 min TTL for forecasts)
    const cacheKey = `forecast:${symbol}`;
    const cached = getCached(cacheKey, 600000);
    if (cached) return res.json(cached);

    const summary = await yf.quoteSummary(symbol, {
      modules: ['earningsTrend', 'financialData', 'earnings']
    });

    const fd = summary.financialData || {};
    const earnings = summary.earnings || {};
    const earningsTrend = summary.earningsTrend?.trend || [];

    // Extract analyst estimates
    const currentQuarter = earningsTrend.find(t => t.period === '0q') || {};
    const nextQuarter = earningsTrend.find(t => t.period === '+1q') || {};
    const currentYear = earningsTrend.find(t => t.period === '0y') || {};
    const nextYear = earningsTrend.find(t => t.period === '+1y') || {};

    // Extract earnings history
    const earningsHistory = earnings.earningsChart?.quarterly || [];

    const response = {
      success: true,
      symbol,
      data: {
        // Target Price & Recommendation
        target_price: {
          current: fd.currentPrice || null,
          mean: fd.targetMeanPrice || null,
          low: fd.targetLowPrice || null,
          high: fd.targetHighPrice || null,
        },
        recommendation: {
          key: fd.recommendationKey || null,       // "buy", "hold", "sell"
          mean: fd.recommendationMean || null,      // 1.0 (Strong Buy) to 5.0 (Strong Sell)
          analysts: fd.numberOfAnalystOpinions || 0,
        },

        // EPS Estimates
        eps_estimates: {
          current_quarter: {
            period: currentQuarter.period || '0q',
            estimate: currentQuarter.earningsEstimate?.avg || null,
            low: currentQuarter.earningsEstimate?.low || null,
            high: currentQuarter.earningsEstimate?.high || null,
            analysts: currentQuarter.earningsEstimate?.numberOfAnalysts || 0,
          },
          next_quarter: {
            period: nextQuarter.period || '+1q',
            estimate: nextQuarter.earningsEstimate?.avg || null,
            low: nextQuarter.earningsEstimate?.low || null,
            high: nextQuarter.earningsEstimate?.high || null,
            analysts: nextQuarter.earningsEstimate?.numberOfAnalysts || 0,
          },
        },

        // Revenue Estimates
        revenue_estimates: {
          current_quarter: {
            period: currentQuarter.period || '0q',
            estimate: currentQuarter.revenueEstimate?.avg || null,
            low: currentQuarter.revenueEstimate?.low || null,
            high: currentQuarter.revenueEstimate?.high || null,
            analysts: currentQuarter.revenueEstimate?.numberOfAnalysts || 0,
          },
          next_quarter: {
            period: nextQuarter.period || '+1q',
            estimate: nextQuarter.revenueEstimate?.avg || null,
            low: nextQuarter.revenueEstimate?.low || null,
            high: nextQuarter.revenueEstimate?.high || null,
            analysts: nextQuarter.revenueEstimate?.numberOfAnalysts || 0,
          },
        },

        // Earnings History (Actual vs Estimate)
        earnings_history: earningsHistory.map(e => ({
          quarter: e.date,
          actual: e.actual || null,
          estimate: e.estimate || null,
          surprise_pct: e.surprisePercent || null,
        })),

        // Yearly outlook
        yearly_outlook: {
          current_year: {
            eps_estimate: currentYear.earningsEstimate?.avg || null,
            revenue_estimate: currentYear.revenueEstimate?.avg || null,
            growth: currentYear.growth?.raw || null,
          },
          next_year: {
            eps_estimate: nextYear.earningsEstimate?.avg || null,
            revenue_estimate: nextYear.revenueEstimate?.avg || null,
            growth: nextYear.growth?.raw || null,
          },
        },
      },
    };

    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    logger.error('Forecast failed', { error: err.message, symbol: req.params.symbol });
    res.status(500).json({ success: false, error: 'Failed to fetch forecast data' });
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

// ════════════════════════════════════
// POST /stocks/:symbol/favorite
// Toggle stock favorite status
// ════════════════════════════════════
async function toggleFavorite(req, res) {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const ticker = await Ticker.findOne({ where: { symbol } });
    if (!ticker) {
      return res.status(404).json({ success: false, error: 'Stock not found' });
    }
    
    // Toggle the favorite status
    const nextState = !ticker.is_favorite;
    await Ticker.update({ is_favorite: nextState }, { where: { symbol } });
    
    // Clear cache if needed since favorites state changed
    cache.clear(); 

    res.json({
      success: true,
      symbol,
      is_favorite: nextState
    });
  } catch (err) {
    logger.error('Failed to toggle favorite', { error: err.message, symbol: req.params.symbol });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

module.exports = { screenStocks, getStockDetail, getChartData, getForecast, getSectors, getFinancialChartData, toggleFavorite };

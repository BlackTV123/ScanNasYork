/**
 * Stock Controller
 * Business logic for screening, detail, and history endpoints.
 */

const { query } = require('../../db/pool');
const logger = require('../../utils/logger');

// ============================================
// Simple In-Memory Cache
// ============================================
const cache = new Map();

function getCached(key, ttlMs = 300000) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.ts < ttlMs) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
  // Evict old entries periodically
  if (cache.size > 500) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.ts > 600000) cache.delete(k);
    }
  }
}

// ============================================
// GET /stocks/screen
// ============================================
async function screenStocks(req, res) {
  const start = Date.now();
  try {
    const filters = req.query;
    const cacheKey = `screen:${JSON.stringify(filters)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.json({ ...cached, cached: true, execution_time_ms: Date.now() - start });
    }

    // Build dynamic SQL
    const { sql, countSql, params } = buildScreenQuery(filters);

    const [dataResult, countResult] = await Promise.all([
      query(sql, params.dataParams),
      query(countSql, params.countParams),
    ]);

    const totalResults = parseInt(countResult.rows[0]?.total || 0, 10);
    const limit = parseInt(filters.limit, 10) || 50;
    const offset = parseInt(filters.offset, 10) || 0;

    const response = {
      success: true,
      data: dataResult.rows,
      pagination: {
        total_results: totalResults,
        returned: dataResult.rows.length,
        limit,
        offset,
        pages: Math.ceil(totalResults / limit),
      },
      execution_time_ms: Date.now() - start,
    };

    setCache(cacheKey, response);
    res.json(response);
  } catch (err) {
    logger.error('Screen query failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

/**
 * Build parameterized SQL for the screening endpoint.
 */
function buildScreenQuery(filters) {
  const conditions = [];
  const values = [];
  let paramIdx = 1;

  // We JOIN with the latest Daily_Metrics row per symbol
  // using a LATERAL join for performance

  // Technical filters
  if (filters.rsi_min !== undefined) {
    conditions.push(`dm.rsi_14 >= $${paramIdx++}`);
    values.push(parseFloat(filters.rsi_min));
  }
  if (filters.rsi_max !== undefined) {
    conditions.push(`dm.rsi_14 <= $${paramIdx++}`);
    values.push(parseFloat(filters.rsi_max));
  }
  if (filters.macd_positive === 'true' || filters.macd_positive === true) {
    conditions.push(`dm.macd > 0`);
  }
  if (filters.price_above_sma_20 === 'true' || filters.price_above_sma_20 === true) {
    conditions.push(`dm.close > dm.sma_20`);
  }
  if (filters.price_above_sma_50 === 'true' || filters.price_above_sma_50 === true) {
    conditions.push(`dm.close > dm.sma_50`);
  }

  // Fundamental filters
  if (filters.eps_min !== undefined) {
    conditions.push(`t.ttm_eps >= $${paramIdx++}`);
    values.push(parseFloat(filters.eps_min));
  }
  if (filters.eps_max !== undefined) {
    conditions.push(`t.ttm_eps <= $${paramIdx++}`);
    values.push(parseFloat(filters.eps_max));
  }
  if (filters.revenue_min !== undefined) {
    conditions.push(`t.ttm_revenue >= $${paramIdx++}`);
    values.push(parseFloat(filters.revenue_min) * 1_000_000); // Input in millions
  }
  if (filters.revenue_max !== undefined) {
    conditions.push(`t.ttm_revenue <= $${paramIdx++}`);
    values.push(parseFloat(filters.revenue_max) * 1_000_000);
  }
  if (filters.pe_ratio_min !== undefined) {
    conditions.push(`t.pe_ratio >= $${paramIdx++}`);
    values.push(parseFloat(filters.pe_ratio_min));
  }
  if (filters.pe_ratio_max !== undefined) {
    conditions.push(`t.pe_ratio <= $${paramIdx++}`);
    values.push(parseFloat(filters.pe_ratio_max));
  }
  if (filters.eps_yoy_growth_min !== undefined) {
    conditions.push(`t.latest_eps_yoy_growth >= $${paramIdx++}`);
    values.push(parseFloat(filters.eps_yoy_growth_min));
  }
  if (filters.market_cap_min !== undefined) {
    conditions.push(`t.market_cap >= $${paramIdx++}`);
    values.push(parseFloat(filters.market_cap_min));
  }
  if (filters.market_cap_max !== undefined) {
    conditions.push(`t.market_cap <= $${paramIdx++}`);
    values.push(parseFloat(filters.market_cap_max));
  }
  if (filters.sector) {
    conditions.push(`t.sector = $${paramIdx++}`);
    values.push(filters.sector);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  // Sorting
  const sortMap = {
    'symbol': 't.symbol',
    'company_name': 't.company_name',
    'current_price': 't.current_price',
    'rsi_14': 'dm.rsi_14',
    'macd': 'dm.macd',
    'ttm_eps': 't.ttm_eps',
    'ttm_revenue': 't.ttm_revenue',
    'pe_ratio': 't.pe_ratio',
    'latest_eps_yoy_growth': 't.latest_eps_yoy_growth',
    'market_cap': 't.market_cap',
  };

  const sortColumn = sortMap[filters.sort_by] || 't.symbol';
  const sortOrder = filters.sort_order === 'desc' ? 'DESC' : 'ASC';

  const limit = parseInt(filters.limit, 10) || 50;
  const offset = parseInt(filters.offset, 10) || 0;

  const dataParamIdx = paramIdx;
  const limitParam = `$${paramIdx++}`;
  const offsetParam = `$${paramIdx++}`;

  const baseSql = `
    FROM Tickers t
    LEFT JOIN LATERAL (
      SELECT * FROM Daily_Metrics dm2
      WHERE dm2.symbol = t.symbol
      ORDER BY dm2.date DESC
      LIMIT 1
    ) dm ON true
    ${whereClause}
  `;

  const sql = `
    SELECT
      t.symbol,
      t.company_name,
      t.sector,
      t.industry,
      t.market_cap,
      t.current_price,
      t.price_change_pct,
      t.ttm_eps,
      t.ttm_revenue,
      t.ttm_net_income,
      t.latest_eps_yoy_growth,
      t.pe_ratio,
      dm.rsi_14,
      dm.rsi_7,
      dm.macd,
      dm.macd_signal,
      dm.macd_histogram,
      dm.sma_20,
      dm.sma_50,
      dm.sma_200,
      dm.volume,
      dm.close,
      dm.date AS metrics_date
    ${baseSql}
    ORDER BY ${sortColumn} ${sortOrder} NULLS LAST
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const countSql = `SELECT COUNT(*) as total ${baseSql}`;

  return {
    sql,
    countSql,
    params: {
      dataParams: [...values, limit, offset],
      countParams: [...values],
    },
  };
}

// ============================================
// GET /stocks/:symbol
// ============================================
async function getStockDetail(req, res) {
  try {
    const { symbol } = req.params;
    const upper = symbol.toUpperCase();

    // Parallel fetch: ticker + latest metrics + quarterly history
    const [tickerRes, metricsRes, quarterlyRes] = await Promise.all([
      query('SELECT * FROM Tickers WHERE symbol = $1', [upper]),
      query(`SELECT * FROM Daily_Metrics WHERE symbol = $1 ORDER BY date DESC LIMIT 1`, [upper]),
      query(`SELECT * FROM Income_Statements WHERE symbol = $1 AND period_type = 'Quarterly' ORDER BY fiscal_year DESC, fiscal_period DESC LIMIT 12`, [upper]),
    ]);

    if (tickerRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Stock not found' });
    }

    const ticker = tickerRes.rows[0];
    const metrics = metricsRes.rows[0] || null;

    res.json({
      success: true,
      data: {
        symbol: ticker.symbol,
        company_name: ticker.company_name,
        sector: ticker.sector,
        industry: ticker.industry,
        market_cap: ticker.market_cap,
        current_metrics: metrics ? {
          price: metrics.close,
          rsi_14: metrics.rsi_14,
          rsi_7: metrics.rsi_7,
          sma_20: metrics.sma_20,
          sma_50: metrics.sma_50,
          sma_200: metrics.sma_200,
          macd: metrics.macd,
          macd_signal: metrics.macd_signal,
          macd_histogram: metrics.macd_histogram,
          volume: metrics.volume,
          bb_upper: metrics.bb_upper,
          bb_lower: metrics.bb_lower,
          atr_14: metrics.atr_14,
          date: metrics.date,
        } : null,
        fundamentals: {
          ttm_revenue: ticker.ttm_revenue,
          ttm_eps: ticker.ttm_eps,
          ttm_net_income: ticker.ttm_net_income,
          pe_ratio: ticker.pe_ratio,
          latest_eps_yoy_growth: ticker.latest_eps_yoy_growth,
        },
        quarterly_history: quarterlyRes.rows.map(q => ({
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

// ============================================
// GET /stocks/:symbol/history
// ============================================
async function getStockHistory(req, res) {
  try {
    const { symbol } = req.params;
    const upper = symbol.toUpperCase();
    const days = parseInt(req.query.days, 10) || 30;

    const result = await query(
      `SELECT date, open, high, low, close, volume, rsi_14, rsi_7,
              macd, macd_signal, macd_histogram, sma_20, sma_50, sma_200,
              bb_upper, bb_middle, bb_lower, atr_14
       FROM Daily_Metrics
       WHERE symbol = $1
       ORDER BY date DESC
       LIMIT $2`,
      [upper, days]
    );

    res.json({
      success: true,
      symbol: upper,
      days,
      data: result.rows.reverse(), // oldest first for charts
    });
  } catch (err) {
    logger.error('Stock history failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

// ============================================
// GET /stocks/sectors
// ============================================
async function getSectors(req, res) {
  try {
    const result = await query(
      `SELECT DISTINCT sector FROM Tickers WHERE sector IS NOT NULL ORDER BY sector`
    );
    res.json({ success: true, data: result.rows.map(r => r.sector) });
  } catch (err) {
    logger.error('Sectors query failed', { error: err.message });
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
}

module.exports = { screenStocks, getStockDetail, getStockHistory, getSectors };

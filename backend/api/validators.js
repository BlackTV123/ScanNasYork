/**
 * Joi Validation Schemas
 */

const Joi = require('joi');

const screenQuerySchema = Joi.object({
  // Technical Filters
  rsi_min: Joi.number().min(0).max(100).optional(),
  rsi_max: Joi.number().min(0).max(100).optional(),
  macd_positive: Joi.boolean().optional(),
  building_base: Joi.boolean().optional(),
  favorites_only: Joi.boolean().optional(),

  // Fundamental Filters
  eps_min: Joi.number().optional(),
  eps_max: Joi.number().optional(),
  revenue_min: Joi.number().optional(),
  revenue_max: Joi.number().optional(),
  pe_ratio_min: Joi.number().optional(),
  pe_ratio_max: Joi.number().optional(),
  eps_yoy_growth_min: Joi.number().optional(),
  rev_growth_min: Joi.number().optional(),
  rev_consecutive_years: Joi.number().integer().optional(),
  upside_min: Joi.number().optional(),
  market_cap_min: Joi.number().optional(),
  market_cap_max: Joi.number().optional(),
  sector: Joi.string().optional(),
  search: Joi.string().trim().empty('').optional(),

  // Pagination / Sorting
  limit: Joi.number().integer().min(1).max(10000).default(50),
  offset: Joi.number().integer().min(0).default(0),
  sort_by: Joi.string().valid(
    'symbol', 'company_name', 'current_price', 'rsi_14',
    'macd', 'ttm_eps', 'ttm_revenue', 'pe_ratio',
    'latest_eps_yoy_growth', 'market_cap', 'target_mean_price',
    'revenue_yoy_growth', 'revenue_consecutive_years'
  ).default('symbol'),
  sort_order: Joi.string().valid('asc', 'desc').default('asc'),
});

const symbolParamSchema = Joi.object({
  symbol: Joi.string().uppercase().min(1).max(10).required(),
});

const chartQuerySchema = Joi.object({
  range: Joi.string().valid('1d', '1w', '1m', '3m').default('1d'),
});

module.exports = { screenQuerySchema, symbolParamSchema, chartQuerySchema };

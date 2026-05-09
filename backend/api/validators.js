/**
 * Joi Validation Schemas
 */

const Joi = require('joi');

const screenQuerySchema = Joi.object({
  // Technical Filters
  rsi_min: Joi.number().min(0).max(100).optional(),
  rsi_max: Joi.number().min(0).max(100).optional(),
  macd_positive: Joi.boolean().optional(),
  price_above_sma_20: Joi.boolean().optional(),
  price_above_sma_50: Joi.boolean().optional(),

  // Fundamental Filters
  eps_min: Joi.number().optional(),
  eps_max: Joi.number().optional(),
  revenue_min: Joi.number().optional(),
  revenue_max: Joi.number().optional(),
  pe_ratio_min: Joi.number().optional(),
  pe_ratio_max: Joi.number().optional(),
  eps_yoy_growth_min: Joi.number().optional(),
  market_cap_min: Joi.number().optional(),
  market_cap_max: Joi.number().optional(),
  sector: Joi.string().optional(),

  // Pagination / Sorting
  limit: Joi.number().integer().min(1).max(500).default(50),
  offset: Joi.number().integer().min(0).default(0),
  sort_by: Joi.string().valid(
    'symbol', 'company_name', 'current_price', 'rsi_14',
    'macd', 'ttm_eps', 'ttm_revenue', 'pe_ratio',
    'latest_eps_yoy_growth', 'market_cap'
  ).default('symbol'),
  sort_order: Joi.string().valid('asc', 'desc').default('asc'),
});

const symbolParamSchema = Joi.object({
  symbol: Joi.string().uppercase().min(1).max(10).required(),
});

const historyQuerySchema = Joi.object({
  days: Joi.number().integer().min(7).max(365).default(30),
  indicators: Joi.string().optional(), // comma-separated
});

module.exports = { screenQuerySchema, symbolParamSchema, historyQuerySchema };

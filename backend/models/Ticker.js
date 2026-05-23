/**
 * Ticker Model
 * Main registry for all stocks — stores pre-computed fundamental + technical data.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const Ticker = sequelize.define('Ticker', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  symbol: {
    type: DataTypes.STRING(10),
    unique: true,
    allowNull: false,
  },
  company_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
  },
  sector: {
    type: DataTypes.STRING(100),
  },
  industry: {
    type: DataTypes.STRING(100),
  },
  market_cap: {
    type: DataTypes.BIGINT,
  },

  // ── Current Price ──
  current_price: {
    type: DataTypes.DECIMAL(10, 2),
  },
  price_change_pct: {
    type: DataTypes.DECIMAL(5, 2),
  },
  target_mean_price: {
    type: DataTypes.FLOAT,
  },
  volume: {
    type: DataTypes.BIGINT,
  },

  // ── Cached Fundamental (TTM) ──
  ttm_revenue: {
    type: DataTypes.BIGINT,
  },
  revenue_yoy_growth: {
    type: DataTypes.FLOAT,
  },
  revenue_consecutive_years: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  ttm_eps: {
    type: DataTypes.DECIMAL(10, 2),
  },
  ttm_net_income: {
    type: DataTypes.BIGINT,
  },
  latest_eps_yoy_growth: {
    type: DataTypes.DECIMAL(5, 2),
  },
  pe_ratio: {
    type: DataTypes.DECIMAL(10, 2),
  },

  // ── Cached Technical Indicators (Latest) ──
  rsi_14: {
    type: DataTypes.DECIMAL(5, 2),
  },
  rsi_7: {
    type: DataTypes.DECIMAL(5, 2),
  },
  macd: {
    type: DataTypes.DECIMAL(10, 4),
  },
  macd_signal: {
    type: DataTypes.DECIMAL(10, 4),
  },
  macd_histogram: {
    type: DataTypes.DECIMAL(10, 4),
  },
  bb_upper: {
    type: DataTypes.DECIMAL(10, 2),
  },
  bb_middle: {
    type: DataTypes.DECIMAL(10, 2),
  },
  bb_lower: {
    type: DataTypes.DECIMAL(10, 2),
  },
  atr_14: {
    type: DataTypes.DECIMAL(10, 2),
  },

  // ── Metadata ──
  last_technical_update: {
    type: DataTypes.DATE,
  },
  last_fundamental_update: {
    type: DataTypes.DATE,
  },
  last_sec_update: {
    type: DataTypes.DATE,
  },
}, {
  tableName: 'tickers',
  indexes: [
    { fields: ['symbol'], unique: true },
    { fields: ['ttm_eps'] },
    { fields: ['ttm_revenue'] },
    { fields: ['pe_ratio'] },
    { fields: ['sector'] },
    { fields: ['market_cap'] },
    { fields: ['rsi_14'] },
    { fields: ['current_price'] },
  ],
});

module.exports = Ticker;

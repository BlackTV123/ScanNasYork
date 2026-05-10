/**
 * Ticker Model
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
  sector: {
    type: DataTypes.STRING(100),
  },
  industry: {
    type: DataTypes.STRING(100),
  },
  market_cap: {
    type: DataTypes.BIGINT,
  },
  current_price: {
    type: DataTypes.DECIMAL(10, 2),
  },
  price_change_pct: {
    type: DataTypes.DECIMAL(5, 2),
  },
  ttm_revenue: {
    type: DataTypes.BIGINT,
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
  rsi_14: {
    type: DataTypes.DECIMAL(10, 2),
  },
  macd: {
    type: DataTypes.DECIMAL(10, 4),
  },
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
  ],
});

module.exports = Ticker;

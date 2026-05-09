/**
 * DailyMetric Model
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const DailyMetric = sequelize.define('DailyMetric', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  symbol: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  open: { type: DataTypes.DECIMAL(10, 2) },
  high: { type: DataTypes.DECIMAL(10, 2) },
  low: { type: DataTypes.DECIMAL(10, 2) },
  close: { type: DataTypes.DECIMAL(10, 2) },
  volume: { type: DataTypes.BIGINT },
  rsi_14: { type: DataTypes.DECIMAL(5, 2) },
  rsi_14_ma: { type: DataTypes.DECIMAL(5, 2) },
  rsi_14_bb_upper: { type: DataTypes.DECIMAL(5, 2) },
  rsi_14_bb_lower: { type: DataTypes.DECIMAL(5, 2) },
  rsi_7: { type: DataTypes.DECIMAL(5, 2) },
  macd: { type: DataTypes.DECIMAL(10, 4) },
  macd_signal: { type: DataTypes.DECIMAL(10, 4) },
  macd_histogram: { type: DataTypes.DECIMAL(10, 4) },
  bb_upper: { type: DataTypes.DECIMAL(10, 2) },
  bb_lower: { type: DataTypes.DECIMAL(10, 2) },
  bb_middle: { type: DataTypes.DECIMAL(10, 2) },
  atr_14: { type: DataTypes.DECIMAL(10, 2) },
}, {
  tableName: 'daily_metrics',
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['symbol', 'date'] },
    { fields: ['date'] },
    { fields: ['rsi_14'] },
    { fields: ['symbol'] },
  ],
});

module.exports = DailyMetric;

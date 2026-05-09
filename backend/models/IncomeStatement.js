/**
 * IncomeStatement Model
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

const IncomeStatement = sequelize.define('IncomeStatement', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  symbol: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  period_type: {
    type: DataTypes.STRING(10),
    allowNull: false,
    validate: { isIn: [['Annual', 'Quarterly']] },
  },
  fiscal_year: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  fiscal_period: {
    type: DataTypes.STRING(10),
    allowNull: false,
  },
  revenue: { type: DataTypes.BIGINT },
  cost_of_revenue: { type: DataTypes.BIGINT },
  gross_profit: { type: DataTypes.BIGINT },
  operating_expenses: { type: DataTypes.BIGINT },
  operating_income: { type: DataTypes.BIGINT },
  net_income: { type: DataTypes.BIGINT },
  eps: { type: DataTypes.DECIMAL(10, 4) },
  shares_outstanding: { type: DataTypes.BIGINT },
  report_date: {
    type: DataTypes.DATEONLY,
    allowNull: false,
  },
  filing_date: { type: DataTypes.DATEONLY },
  source_api: { type: DataTypes.STRING(50) },
}, {
  tableName: 'income_statements',
  updatedAt: false,
  indexes: [
    { unique: true, fields: ['symbol', 'fiscal_year', 'fiscal_period'] },
    { fields: ['symbol'] },
    { fields: ['report_date'] },
    { fields: ['fiscal_year'] },
  ],
});

module.exports = IncomeStatement;

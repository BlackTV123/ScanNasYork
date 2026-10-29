const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

// A durable, source-labelled snapshot, including recent observations and their periods.
module.exports = sequelize.define('EconomicSeries', {
  id: { type: DataTypes.STRING(80), primaryKey: true },
  dataset: { type: DataTypes.STRING(30), allowNull: false },
  payload: { type: DataTypes.JSON, allowNull: false },
  fetched_at: { type: DataTypes.DATE, allowNull: false },
}, { tableName: 'economic_series', timestamps: false });

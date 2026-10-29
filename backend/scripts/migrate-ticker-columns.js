require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { DataTypes } = require('sequelize');
const sequelize = require('../db/sequelize');

(async () => {
  try {
    const qi = sequelize.getQueryInterface();
    const columns = await qi.describeTable('tickers');
    const additions = {
      rsi_14: { type: DataTypes.DECIMAL(5, 2) },
      macd: { type: DataTypes.DECIMAL(10, 4) },
      is_favorite: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    };
    for (const [name, definition] of Object.entries(additions)) {
      if (!columns[name]) await qi.addColumn('tickers', name, definition);
    }
    console.log('Successfully altered tables.');
  } catch (err) {
    console.error('Error:', err.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
})();

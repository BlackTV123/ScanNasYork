require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { sequelize } = require('./models');
sequelize.query('ALTER TABLE tickers ADD COLUMN description TEXT;')
  .then(() => console.log('Column description added'))
  .catch(console.error)
  .finally(() => process.exit(0));

const { EconomicSeries } = require('../../models');

module.exports = {
  async load(dataset) {
    const rows = await EconomicSeries.findAll({ where: { dataset }, raw: true });
    return rows.map(row => ({ ...(typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload), fetched_at: new Date(row.fetched_at).toISOString() }));
  },
  async save(dataset, items) {
    if (!items.length) return;
    await EconomicSeries.bulkCreate(items.map(item => ({ id: item.id, dataset, payload: item, fetched_at: item.fetched_at })), {
      updateOnDuplicate: ['payload', 'fetched_at'],
    });
  },
};

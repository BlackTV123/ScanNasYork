const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDirectory, getExchangeTickers } = require('../utils/symbol-directory');

test('exchange directory excludes ETFs, test issues and non-NYSE listings', () => {
  const text = 'ACT Symbol|Security Name|Exchange|ETF|Test Issue\r\n' +
    'BRK.B|Berkshire Hathaway|N|N|N\r\nFUND|ETF|N|Y|N\r\nTEST|Test|N|N|Y\r\nOTHER|Other venue|A|N|N\r\nFile Creation Time: 1234||||';
  assert.deepEqual(parseDirectory(text, { symbolColumn: 'ACT Symbol', exchange: 'N' }), [
    { symbol: 'BRK-B', company_name: 'Berkshire Hathaway' },
  ]);
  assert.throws(() => parseDirectory('<html>Error</html>', { symbolColumn: 'Symbol' }), /missing Symbol/);
});

test('fetch validates responses and de-duplicates ticker symbols', async () => {
  const result = await getExchangeTickers(async url => ({ ok: true, text: async () => url.endsWith('nasdaqlisted.txt')
    ? 'Symbol|Security Name|Test Issue|ETF\nAAA|Alpha|N|N'
    : 'ACT Symbol|Security Name|Test Issue|ETF|Exchange\nAAA|Alpha|N|N|N\nBBB|Beta|N|N|N' }));
  assert.deepEqual(result.map(t => t.symbol), ['AAA', 'BBB']);
  await assert.rejects(getExchangeTickers(async () => ({ ok: false, status: 503 })), /HTTP 503/);
});

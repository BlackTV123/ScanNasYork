const SOURCES = [
  { file: 'nasdaqlisted.txt', symbolColumn: 'Symbol' },
  { file: 'otherlisted.txt', symbolColumn: 'ACT Symbol', exchange: 'N' },
];

function parseDirectory(text, { symbolColumn, exchange }) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().replace(/^\uFEFF/, '').split('|');
  for (const required of [symbolColumn, 'Security Name', 'Test Issue', 'ETF']) {
    if (!headers.includes(required)) throw new Error(`Invalid symbol directory: missing ${required}`);
  }
  if (exchange && !headers.includes('Exchange')) throw new Error('Invalid symbol directory: missing Exchange');
  return lines.flatMap(line => {
    const fields = line.split('|');
    const row = Object.fromEntries(headers.map((header, index) => [header, fields[index]?.trim()]));
    if (row['Test Issue'] !== 'N' || row.ETF !== 'N') return [];
    if (exchange && row.Exchange !== exchange) return [];
    const symbol = row[symbolColumn]?.replace(/\./g, '-');
    if (!symbol || !/^[A-Z][A-Z0-9-]{0,9}$/.test(symbol) || !row['Security Name']) return [];
    return [{ symbol, company_name: row['Security Name'].slice(0, 255) }];
  });
}

async function getExchangeTickers(fetchFn = fetch) {
  const lists = await Promise.all(SOURCES.map(async source => {
    const response = await fetchFn(`https://www.nasdaqtrader.com/dynamic/SymDir/${source.file}`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Symbol directory ${source.file}: HTTP ${response.status}`);
    const rows = parseDirectory(await response.text(), source);
    if (!rows.length) throw new Error(`Symbol directory ${source.file} returned no eligible stocks`);
    return rows;
  }));
  return [...new Map(lists.flat().map(row => [row.symbol, row])).values()];
}

module.exports = { getExchangeTickers, parseDirectory };

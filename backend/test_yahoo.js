const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey', 'ripHistorical'] });

async function testYahoo() {
  try {
    const summary = await yahooFinance.quoteSummary('AAPL', {
      modules: ['incomeStatementHistory', 'incomeStatementHistoryQuarterly']
    });
    
    const annual = summary.incomeStatementHistory?.incomeStatementHistory || [];
    const quarterly = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory || [];
    
    console.log(`Annual count: ${annual.length}`);
    console.log(`Quarterly count: ${quarterly.length}`);
    
    if (annual.length > 0) {
      console.log('Sample annual:', { 
        date: annual[0].endDate, 
        revenue: annual[0].totalRevenue, 
        netIncome: annual[0].netIncome 
      });
    }
  } catch(e) {
    console.error(e);
  }
}
testYahoo();

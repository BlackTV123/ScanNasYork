require('dotenv').config({ path: require('path').join(__dirname, '.env') });

async function testFMP() {
  const apiKeyStr = process.env.FMP_API_KEY || ''; 
  const apiKey = apiKeyStr.replace('apikey=', '');
  
  try {
    const res = await fetch(`https://financialmodelingprep.com/api/v3/income-statement/AAPL?period=quarter&limit=20&apikey=${apiKey}`);
    const data = await res.json();
    console.log(`API response:`, data);
  } catch (e) {
    console.error('FMP error:', e.message);
  }
}

testFMP();

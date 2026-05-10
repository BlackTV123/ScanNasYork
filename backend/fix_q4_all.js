require('dotenv').config();
const { Ticker, IncomeStatement, sequelize } = require('./models');
const { Op } = require('sequelize');

async function fixQ4All() {
    console.log('=== Starting Q4 Auto-Calculation for ALL stocks ===');
    const start = Date.now();

    try {
        // 1. Get all unique symbols
        const symbolsData = await IncomeStatement.findAll({
            attributes: [[sequelize.fn('DISTINCT', sequelize.col('symbol')), 'symbol']],
            raw: true
        });

        const symbols = symbolsData.map(s => s.symbol);
        console.log(`Found ${symbols.length} symbols with income data. processing...`);

        let createdCount = 0;
        let batchSize = 100;

        for (let i = 0; i < symbols.length; i += batchSize) {
            const batchSymbols = symbols.slice(i, i + batchSize);
            
            // Fetch all statements for this batch
            const stmts = await IncomeStatement.findAll({ 
                where: { symbol: { [Op.in]: batchSymbols } }, 
                raw: true 
            });
            
            // Group by symbol then year
            const grouped = {};
            for (const st of stmts) {
                if (!grouped[st.symbol]) grouped[st.symbol] = {};
                if (!grouped[st.symbol][st.fiscal_year]) grouped[st.symbol][st.fiscal_year] = {};
                grouped[st.symbol][st.fiscal_year][st.fiscal_period] = st;
            }

            // Process each symbol in batch
            for (const symbol of batchSymbols) {
                const years = grouped[symbol] || {};
                for (const yr in years) {
                    const data = years[yr];
                    if (data.FY && data.Q1 && data.Q2 && data.Q3 && !data.Q4) {
                        const fy = data.FY;
                        const q1 = data.Q1;
                        const q2 = data.Q2;
                        const q3 = data.Q3;

                        const calcQ4 = {
                            symbol,
                            period_type: 'Quarterly',
                            fiscal_year: parseInt(yr),
                            fiscal_period: 'Q4',
                            report_date: fy.report_date,
                            source_api: 'calc_q4_fix',
                        };

                        // Helper to safely subtract big numbers
                        const sub = (f, a, b, c) => {
                            if (f == null || a == null || b == null || c == null) return null;
                            try {
                                return (BigInt(f) - BigInt(a) - BigInt(b) - BigInt(c)).toString();
                            } catch(e) { return null; }
                        };

                        calcQ4.revenue = sub(fy.revenue, q1.revenue, q2.revenue, q3.revenue);
                        calcQ4.net_income = sub(fy.net_income, q1.net_income, q2.net_income, q3.net_income);

                        if (calcQ4.revenue || calcQ4.net_income) {
                            await IncomeStatement.upsert(calcQ4);
                            createdCount++;
                        }
                    }
                }
            }
            console.log(`Processed ${Math.min(i + batchSize, symbols.length)}/${symbols.length} symbols...`);
        }

        console.log(`=== Done! Created ${createdCount} Q4 records in ${((Date.now() - start)/1000).toFixed(1)}s ===`);
    } catch (err) {
        console.error('Error fixing Q4:', err);
    } finally {
        process.exit(0);
    }
}

fixQ4All();

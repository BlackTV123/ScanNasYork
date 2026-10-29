function buildForecastResponse(symbol, summary) {
    const fd = summary.financialData || {};
    const earnings = summary.earnings || {};
    const earningsTrend = summary.earningsTrend?.trend || [];

    // Extract analyst estimates
    const currentQuarter = earningsTrend.find(t => t.period === '0q') || {};
    const nextQuarter = earningsTrend.find(t => t.period === '+1q') || {};
    const currentYear = earningsTrend.find(t => t.period === '0y') || {};
    const nextYear = earningsTrend.find(t => t.period === '+1y') || {};

    // Extract earnings history
    const earningsHistory = earnings.earningsChart?.quarterly || [];

    const response = {
      success: true,
      symbol,
      data: {
        // Target Price & Recommendation
        target_price: {
          current: fd.currentPrice ?? null,
          mean: fd.targetMeanPrice ?? null,
          low: fd.targetLowPrice ?? null,
          high: fd.targetHighPrice ?? null,
        },
        recommendation: {
          key: fd.recommendationKey ?? null,       // "buy", "hold", "sell"
          mean: fd.recommendationMean ?? null,      // 1.0 (Strong Buy) to 5.0 (Strong Sell)
          analysts: fd.numberOfAnalystOpinions || 0,
        },

        // EPS Estimates
        eps_estimates: {
          current_quarter: {
            period: currentQuarter.period || '0q',
            estimate: currentQuarter.earningsEstimate?.avg ?? null,
            low: currentQuarter.earningsEstimate?.low ?? null,
            high: currentQuarter.earningsEstimate?.high ?? null,
            analysts: currentQuarter.earningsEstimate?.numberOfAnalysts || 0,
          },
          next_quarter: {
            period: nextQuarter.period || '+1q',
            estimate: nextQuarter.earningsEstimate?.avg ?? null,
            low: nextQuarter.earningsEstimate?.low ?? null,
            high: nextQuarter.earningsEstimate?.high ?? null,
            analysts: nextQuarter.earningsEstimate?.numberOfAnalysts || 0,
          },
        },

        // Revenue Estimates
        revenue_estimates: {
          current_quarter: {
            period: currentQuarter.period || '0q',
            estimate: currentQuarter.revenueEstimate?.avg ?? null,
            low: currentQuarter.revenueEstimate?.low ?? null,
            high: currentQuarter.revenueEstimate?.high ?? null,
            analysts: currentQuarter.revenueEstimate?.numberOfAnalysts || 0,
          },
          next_quarter: {
            period: nextQuarter.period || '+1q',
            estimate: nextQuarter.revenueEstimate?.avg ?? null,
            low: nextQuarter.revenueEstimate?.low ?? null,
            high: nextQuarter.revenueEstimate?.high ?? null,
            analysts: nextQuarter.revenueEstimate?.numberOfAnalysts || 0,
          },
        },

        // Earnings History (Actual vs Estimate)
        earnings_history: earningsHistory.map(e => ({
          quarter: e.date,
          actual: e.actual ?? null,
          estimate: e.estimate ?? null,
          surprise_pct: e.surprisePercent ?? null,
        })),

        // Yearly outlook
        yearly_outlook: {
          current_year: {
            eps_estimate: currentYear.earningsEstimate?.avg ?? null,
            revenue_estimate: currentYear.revenueEstimate?.avg ?? null,
            growth: currentYear.growth?.raw ?? null,
          },
          next_year: {
            eps_estimate: nextYear.earningsEstimate?.avg ?? null,
            revenue_estimate: nextYear.revenueEstimate?.avg ?? null,
            growth: nextYear.growth?.raw ?? null,
          },
        },
      },
    };

    return response;
}

module.exports = { buildForecastResponse };

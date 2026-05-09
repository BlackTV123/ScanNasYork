/**
 * Technical Indicators Calculator
 * Pure math implementations — no external dependencies.
 */

/**
 * Calculate Simple Moving Average.
 * @param {number[]} data - Array of closing prices (oldest first)
 * @param {number} period
 * @returns {number|null}
 */
function sma(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

/**
 * Calculate Exponential Moving Average.
 * @param {number[]} data
 * @param {number} period
 * @returns {number|null}
 */
function ema(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let emaVal = data.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < data.length; i++) {
    emaVal = data[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

/**
 * Calculate RSI (Relative Strength Index).
 * @param {number[]} closes - Closing prices (oldest first, at least period+1 items)
 * @param {number} period - Default 14
 * @returns {number|null} RSI value 0-100
 */
function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;

  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return parseFloat((100 - 100 / (1 + rs)).toFixed(2));
}

/**
 * Calculate MACD (12/26/9).
 * @param {number[]} closes
 * @returns {{ macd: number, signal: number, histogram: number }|null}
 */
function macd(closes) {
  if (closes.length < 35) return null; // Need at least 26 + 9 data points

  const ema12Vals = emaArray(closes, 12);
  const ema26Vals = emaArray(closes, 26);

  // MACD line = EMA(12) - EMA(26)
  const macdLine = [];
  for (let i = 0; i < ema12Vals.length; i++) {
    if (ema26Vals[i] !== null && ema12Vals[i] !== null) {
      macdLine.push(ema12Vals[i] - ema26Vals[i]);
    }
  }

  if (macdLine.length < 9) return null;

  // Signal line = EMA(9) of MACD line
  const signal = ema(macdLine, 9);
  const macdVal = macdLine[macdLine.length - 1];
  const histogram = macdVal - signal;

  return {
    macd: parseFloat(macdVal.toFixed(4)),
    signal: parseFloat(signal.toFixed(4)),
    histogram: parseFloat(histogram.toFixed(4)),
  };
}

/**
 * Calculate Bollinger Bands (20, 2).
 * @param {number[]} closes
 * @param {number} period
 * @param {number} stdDev
 * @returns {{ upper: number, middle: number, lower: number }|null}
 */
function bollingerBands(closes, period = 20, stdDev = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const middle = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + Math.pow(v - middle, 2), 0) / period;
  const sd = Math.sqrt(variance);
  return {
    upper: parseFloat((middle + stdDev * sd).toFixed(2)),
    middle: parseFloat(middle.toFixed(2)),
    lower: parseFloat((middle - stdDev * sd).toFixed(2)),
  };
}

/**
 * Calculate Average True Range.
 * @param {Array<{high:number, low:number, close:number}>} bars
 * @param {number} period
 * @returns {number|null}
 */
function atr(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const trueRanges = [];
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trueRanges.push(tr);
  }
  // Use Wilder's smoothing
  let atrVal = trueRanges.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < trueRanges.length; i++) {
    atrVal = (atrVal * (period - 1) + trueRanges[i]) / period;
  }
  return parseFloat(atrVal.toFixed(2));
}

// Helper: produce full EMA array
function emaArray(data, period) {
  const result = new Array(data.length).fill(null);
  if (data.length < period) return result;
  const k = 2 / (period + 1);
  result[period - 1] = data.slice(0, period).reduce((s, v) => s + v, 0) / period;
  for (let i = period; i < data.length; i++) {
    result[i] = data[i] * k + result[i - 1] * (1 - k);
  }
  return result;
}

/**
 * Calculate all technical indicators from an array of OHLCV bars.
 * Bars should be sorted oldest → newest.
 * @param {Array<{o:number, h:number, l:number, c:number, v:number}>} bars
 * @returns {object} All calculated indicators for the latest bar
 */
function calculateAll(bars) {
  const closes = bars.map(b => b.c);
  const macdResult = macd(closes);
  const bb = bollingerBands(closes);
  const barsForATR = bars.map(b => ({ high: b.h, low: b.l, close: b.c }));

  return {
    rsi_14: rsi(closes, 14),
    rsi_7: rsi(closes, 7),
    macd: macdResult?.macd ?? null,
    macd_signal: macdResult?.signal ?? null,
    macd_histogram: macdResult?.histogram ?? null,
    sma_20: sma(closes, 20) ? parseFloat(sma(closes, 20).toFixed(2)) : null,
    sma_50: sma(closes, 50) ? parseFloat(sma(closes, 50).toFixed(2)) : null,
    sma_200: sma(closes, 200) ? parseFloat(sma(closes, 200).toFixed(2)) : null,
    bb_upper: bb?.upper ?? null,
    bb_middle: bb?.middle ?? null,
    bb_lower: bb?.lower ?? null,
    atr_14: atr(barsForATR, 14),
  };
}

module.exports = { sma, ema, rsi, macd, bollingerBands, atr, calculateAll };

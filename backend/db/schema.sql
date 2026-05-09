-- ============================================
-- ScanNasYork Database Schema
-- PostgreSQL 13+
-- ============================================

-- Drop tables if they exist (development only)
DROP TABLE IF EXISTS Income_Statements CASCADE;
DROP TABLE IF EXISTS Daily_Metrics CASCADE;
DROP TABLE IF EXISTS Tickers CASCADE;

-- ============================================
-- 1. Tickers Table (Main Registry)
-- ============================================
CREATE TABLE Tickers (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  sector VARCHAR(100),
  industry VARCHAR(100),
  market_cap BIGINT,

  -- Cached Technical (Latest)
  current_price DECIMAL(10, 2),
  price_change_pct DECIMAL(5, 2),

  -- Cached Fundamental (TTM)
  ttm_revenue BIGINT,
  ttm_eps DECIMAL(10, 2),
  ttm_net_income BIGINT,
  latest_eps_yoy_growth DECIMAL(5, 2),
  pe_ratio DECIMAL(10, 2),

  -- Metadata
  last_technical_update TIMESTAMP,
  last_fundamental_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tickers_symbol ON Tickers(symbol);
CREATE INDEX idx_tickers_ttm_eps ON Tickers(ttm_eps);
CREATE INDEX idx_tickers_ttm_revenue ON Tickers(ttm_revenue);
CREATE INDEX idx_tickers_pe_ratio ON Tickers(pe_ratio);
CREATE INDEX idx_tickers_sector ON Tickers(sector);
CREATE INDEX idx_tickers_market_cap ON Tickers(market_cap);

-- ============================================
-- 2. Daily_Metrics Table (Technical Data)
-- ============================================
CREATE TABLE Daily_Metrics (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL REFERENCES Tickers(symbol) ON DELETE CASCADE,
  date DATE NOT NULL,

  -- OHLCV
  open DECIMAL(10, 2),
  high DECIMAL(10, 2),
  low DECIMAL(10, 2),
  close DECIMAL(10, 2),
  volume BIGINT,

  -- Technical Indicators
  rsi_14 DECIMAL(5, 2),
  rsi_14_ma DECIMAL(5, 2),
  rsi_14_bb_upper DECIMAL(5, 2),
  rsi_14_bb_lower DECIMAL(5, 2),
  rsi_7 DECIMAL(5, 2),
  macd DECIMAL(10, 4),
  macd_signal DECIMAL(10, 4),
  macd_histogram DECIMAL(10, 4),
  sma_20 DECIMAL(10, 2),
  sma_50 DECIMAL(10, 2),
  sma_200 DECIMAL(10, 2),
  bb_upper DECIMAL(10, 2),
  bb_lower DECIMAL(10, 2),
  bb_middle DECIMAL(10, 2),
  atr_14 DECIMAL(10, 2),

  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_dm_symbol_date ON Daily_Metrics(symbol, date DESC);
CREATE INDEX idx_dm_date ON Daily_Metrics(date);
CREATE INDEX idx_dm_rsi_14 ON Daily_Metrics(rsi_14);
CREATE INDEX idx_dm_symbol ON Daily_Metrics(symbol);

-- ============================================
-- 3. Income_Statements Table (Fundamental Data)
-- ============================================
CREATE TABLE Income_Statements (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL REFERENCES Tickers(symbol) ON DELETE CASCADE,
  period_type VARCHAR(10) NOT NULL CHECK (period_type IN ('Annual', 'Quarterly')),
  fiscal_year INT NOT NULL,
  fiscal_period VARCHAR(10) NOT NULL,

  -- Income Statement Items
  revenue BIGINT,
  cost_of_revenue BIGINT,
  gross_profit BIGINT,
  operating_expenses BIGINT,
  operating_income BIGINT,
  net_income BIGINT,
  eps DECIMAL(10, 4),
  shares_outstanding BIGINT,

  -- Metadata
  report_date DATE NOT NULL,
  filing_date DATE,
  source_api VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_is_symbol_period ON Income_Statements(symbol, fiscal_year, fiscal_period);
CREATE INDEX idx_is_symbol ON Income_Statements(symbol);
CREATE INDEX idx_is_report_date ON Income_Statements(report_date);
CREATE INDEX idx_is_fiscal_year ON Income_Statements(fiscal_year);

-- ============================================
-- 4. Trigger: Auto-update updated_at on Tickers
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tickers_updated_at
  BEFORE UPDATE ON Tickers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

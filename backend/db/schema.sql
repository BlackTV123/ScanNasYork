-- ============================================
-- ScanNasYork Database Schema
-- MySQL 8.0+
-- ============================================

-- Non-destructive MySQL schema. Select the target database before running.

-- ============================================
-- 1. tickers Table (Main Registry)
--    Stores pre-computed fundamental + technical data
-- ============================================
CREATE TABLE IF NOT EXISTS tickers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(10) UNIQUE NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  description TEXT,
  sector VARCHAR(100),
  industry VARCHAR(100),
  market_cap BIGINT,

  -- Current Price
  current_price DECIMAL(10, 2),
  price_change_pct DECIMAL(5, 2),
  target_mean_price FLOAT,
  volume BIGINT,

  -- Cached Fundamental (TTM)
  ttm_revenue BIGINT,
  revenue_yoy_growth FLOAT,
  revenue_consecutive_years INTEGER DEFAULT 0,
  ttm_eps DECIMAL(10, 2),
  ttm_net_income BIGINT,
  latest_eps_yoy_growth DECIMAL(5, 2),
  pe_ratio DECIMAL(10, 2),

  -- Cached Technical Indicators (Latest)
  rsi_14 DECIMAL(5, 2),
  rsi_7 DECIMAL(5, 2),
  macd DECIMAL(10, 4),
  macd_signal DECIMAL(10, 4),
  macd_histogram DECIMAL(10, 4),
  bb_upper DECIMAL(10, 2),
  bb_middle DECIMAL(10, 2),
  bb_lower DECIMAL(10, 2),
  atr_14 DECIMAL(10, 2),
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,

  -- Metadata
  last_technical_update DATETIME,
  last_fundamental_update DATETIME,
  last_sec_update DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_tickers_ttm_eps (ttm_eps),
  KEY idx_tickers_ttm_revenue (ttm_revenue),
  KEY idx_tickers_pe_ratio (pe_ratio),
  KEY idx_tickers_sector (sector),
  KEY idx_tickers_market_cap (market_cap),
  KEY idx_tickers_rsi_14 (rsi_14),
  KEY idx_tickers_current_price (current_price)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ============================================
-- 2. income_statements Table (Fundamental Data)
-- ============================================
CREATE TABLE IF NOT EXISTS income_statements (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  symbol VARCHAR(10) NOT NULL,
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
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY idx_is_symbol_period (symbol, fiscal_year, fiscal_period),
  KEY idx_is_symbol (symbol),
  KEY idx_is_report_date (report_date),
  KEY idx_is_fiscal_year (fiscal_year),
  CONSTRAINT fk_income_ticker FOREIGN KEY (symbol) REFERENCES tickers(symbol) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Durable country-economic snapshots, with source metadata and recent history.
CREATE TABLE IF NOT EXISTS economic_series (
  id VARCHAR(80) NOT NULL PRIMARY KEY,
  dataset VARCHAR(30) NOT NULL,
  payload JSON NOT NULL,
  fetched_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

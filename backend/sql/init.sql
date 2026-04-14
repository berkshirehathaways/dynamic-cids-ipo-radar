CREATE TABLE IF NOT EXISTS ipo_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_name TEXT,
  subscription_period TEXT,
  subscription_start_date TEXT,
  listing_date DATE,
  underwriter TEXT,
  offer_price_text TEXT,
  inst_demand_text TEXT,
  lockup_text TEXT,
  float_ratio REAL,
  float_amount REAL,
  estimated_market_cap REAL,
  adjusted_r REAL,
  cids REAL,
  cids10 REAL,
  signal TEXT,
  decision TEXT,
  reason_line1 TEXT,
  reason_line2 TEXT,
  reason_line3 TEXT,
  source_url TEXT,
  updated_at TEXT,
  UNIQUE(company_name, subscription_period)
);

CREATE TABLE IF NOT EXISTS fetch_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fetched_at TEXT,
  status TEXT,
  http_code INTEGER,
  response_length INTEGER,
  response_hash TEXT,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS anchors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prev_anchor REAL,
  anchor_new REAL,
  anchor_final REAL,
  calculated_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

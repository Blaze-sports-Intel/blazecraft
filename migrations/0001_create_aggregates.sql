CREATE TABLE IF NOT EXISTS aggregates (
  sport TEXT NOT NULL,
  aggregate_date TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (sport, aggregate_date)
);

CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  agent_name TEXT,
  status TEXT,
  task TEXT,
  progress REAL,
  tokens_used INTEGER,
  details TEXT,
  source TEXT,
  session_id TEXT,
  region_id TEXT,
  payload TEXT
);

CREATE INDEX IF NOT EXISTS idx_agent_events_timestamp ON agent_events(timestamp_ms);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent_id);

CREATE TABLE IF NOT EXISTS agent_status (
  agent_id TEXT PRIMARY KEY,
  agent_name TEXT,
  status TEXT,
  task TEXT,
  progress REAL,
  tokens_used INTEGER,
  updated_at TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  source TEXT,
  session_id TEXT,
  region_id TEXT
);

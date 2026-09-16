CREATE TABLE reports (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email TEXT,
  category TEXT NOT NULL DEFAULT 'bug' CHECK (category IN ('bug', 'playback', 'account', 'content', 'other')),
  message TEXT NOT NULL,
  route TEXT,
  app_version TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX reports_status_idx ON reports(status, created_at DESC);
CREATE INDEX reports_user_idx ON reports(user_id, created_at DESC);

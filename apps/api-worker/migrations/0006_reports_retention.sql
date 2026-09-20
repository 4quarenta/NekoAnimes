ALTER TABLE reports ADD COLUMN closed_at TEXT;

UPDATE reports
SET closed_at = updated_at
WHERE status IN ('resolved', 'dismissed') AND closed_at IS NULL;

CREATE INDEX reports_retention_idx ON reports(status, closed_at);

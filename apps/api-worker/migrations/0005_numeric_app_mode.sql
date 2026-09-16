CREATE TABLE app_config_numeric (
  id INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  mode INTEGER NOT NULL DEFAULT 1 CHECK (mode IN (1, 2)),
  payload TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO app_config_numeric (id, version, mode, payload, updated_at)
SELECT
  id,
  version,
  CASE
    WHEN length(CAST(mode AS TEXT)) = 1 THEN CAST(mode AS INTEGER)
    WHEN length(CAST(mode AS TEXT)) = 4 THEN 2
    WHEN length(CAST(mode AS TEXT)) = 9 THEN 1
    ELSE 1
  END,
  payload,
  updated_at
FROM app_config;

DROP TABLE app_config;
ALTER TABLE app_config_numeric RENAME TO app_config;

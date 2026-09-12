-- NekoAnimes STAGING only. Sintel trailer is an openly licensed test video
-- (CC BY 3.0) and is used solely to validate the native Android player.
UPDATE episodes
SET title = 'Vídeo de teste do player (Sintel)', duration_seconds = 52
WHERE id = '31111111-1111-1111-1111-000000000001';

INSERT INTO episode_sources (id, episode_id, url, mime_type, label, headers, is_default)
VALUES (
  '91111111-1111-1111-1111-000000000001',
  '31111111-1111-1111-1111-000000000001',
  'https://media.w3.org/2010/05/sintel/trailer.mp4',
  'video/mp4',
  'Sintel trailer — CC BY 3.0 (teste)',
  '{}',
  1
)
ON CONFLICT(id) DO UPDATE SET
  url = excluded.url,
  mime_type = excluded.mime_type,
  label = excluded.label,
  headers = excluded.headers,
  is_default = excluded.is_default;

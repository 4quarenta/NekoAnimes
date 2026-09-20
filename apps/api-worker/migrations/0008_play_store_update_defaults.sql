UPDATE app_config
SET
  payload = json_set(
    CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,
    '$.updates',
    json_object(
      'enabled', json('true'),
      'mode', 'play_store',
      'versionCode', 10036,
      'versionName', '1.0.36',
      'apkUrl', '',
      'sha256', '',
      'required', json('false'),
      'storeUrl', 'https://play.google.com/store/apps/details?id=com.nekoanimes.app'
    )
  ),
  version = version + 1,
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

UPDATE app_config
SET
  payload = json_set(
    CASE WHEN json_valid(payload) THEN payload ELSE '{}' END,
    '$.ads',
    json_object(
      'enabled', json('false'),
      'provider', 'admob',
      'testMode', json('true'),
      'banner', json_object('enabled', json('true'), 'unitId', 'ca-app-pub-9081602346377817/2542590123'),
      'appOpen', json_object('enabled', json('true'), 'unitId', 'ca-app-pub-9081602346377817/6420282075'),
      'interstitial', json_object('enabled', json('true'), 'unitId', 'ca-app-pub-9081602346377817/9046445412'),
      'appOpenMinIntervalMinutes', 60,
      'appOpenSkipFirstOpens', 0,
      'interstitialMinIntervalMinutes', 30,
      'interstitialMaxPerSession', 2,
      'interstitialPageTransitionFrequency', 3,
      'interstitialShowOnEpisodeStart', json('true')
    )
  ),
  version = version + 1,
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

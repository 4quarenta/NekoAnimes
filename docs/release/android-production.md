# NekoAnimes — Android Production Checklist

## Build identity

- Application ID: `com.nekoanimes.app`
- Version: `1.0.0`
- Version code: `10000`
- Target SDK: 36
- Minimum SDK: 24
- Release build: R8 + resource shrinking enabled
- Production web origin: `https://app.nekoanimes.com`
- Production API origin: `https://api.nekoanimes.com`
- Cleartext HTTP: disabled in release

## Required production infrastructure

Before Production GO:

1. Provision a dedicated Supabase project for NekoAnimes.
2. Configure API environment:
   - `SUPABASE_URL`
   - `SUPABASE_PUBLISHABLE_KEY`
   - `MAL_CLIENT_ID`
   - `ADMIN_API_KEY`
   - `DATABASE_URL`
   - `REDIS_URL`
3. Configure Web environment:
   - `VITE_API_URL=https://api.nekoanimes.com`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `VITE_APP_VERSION=1.0.0`
4. Provision TLS certificates for both production domains.
5. Confirm the app manifest resolves only approved production origins.

## Android signing

Create the upload/release key outside the repository. Never commit the `.jks` file or passwords.

GitHub Actions secrets required by `.github/workflows/android-release.yml`:

- `NEKO_RELEASE_KEYSTORE_BASE64`
- `NEKO_RELEASE_STORE_PASSWORD`
- `NEKO_RELEASE_KEY_ALIAS`
- `NEKO_RELEASE_KEY_PASSWORD`

Ads secrets, when monetization is enabled:

- `MAX_SDK_KEY`
- `MAX_BANNER_AD_UNIT_ID`
- `MAX_APP_OPEN_AD_UNIT_ID`
- `MAX_INTERSTITIAL_AD_UNIT_ID`

If ad credentials are absent, monetization must remain disabled in remote config.

## Store compliance

The store listing and declarations must describe the capabilities actually shipped in the submitted binary and the mode/capabilities available to users. Remote configuration must not be used to conceal functionality from store review.

Before publishing:

- Publish Privacy Policy on an HTTPS public URL.
- Complete Play Console Data safety using the actual production data flows.
- Declare account creation/authentication if enabled.
- Provide account deletion instructions/flow if accounts can be created.
- Declare advertising SDKs and consent behavior.
- Complete content rating questionnaire accurately.
- Confirm rights/licensing for all media, metadata, images and streaming sources used in production.
- Confirm copyright/source attribution for News Mode.

## Smoke test — release candidate

Run on at least one physical Android device and one emulator:

- Cold start with valid manifest.
- Cold start without network using last-known-good manifest.
- First run without network fails safely and offers retry.
- Streaming navigation: Home → A-Z → Search → List → Account.
- Anime detail → season → episode → native player.
- HLS playback and MP4 playback.
- Back closes player and reports progress.
- Continue watching restores progress.
- Login, token refresh, logout and expired-session behavior.
- News Mode: Home → Search → Article → Save → Saved → Account.
- Switching remote mode does not expose routes from the inactive experience.
- Banner does not cover navigation/content.
- App Open and Interstitial obey remote frequency limits.
- Consent refusal does not crash the app.
- External URLs open outside the WebView.
- Release build refuses HTTP production endpoints.
- No debug suffix/package is present in release.

## Release artifacts

The manual `Android Release` workflow produces:

- `nekoanimes-release-apk`
- `nekoanimes-release-aab`

Use the AAB for Google Play. Keep the APK for direct internal validation only.

## Production GO gate

Do not mark Production GO until all of these are true:

- JS typecheck/build passes.
- Android release build passes.
- Signed AAB is generated successfully.
- Dedicated NekoAnimes Supabase project is live.
- Production domains are live over HTTPS.
- Production metadata/content source is validated.
- Store/legal declarations are complete.
- Smoke test has no blocker or critical issue.

# Monetization — Stage 11

## Engine strategy

NekoAnimes uses one mediation engine at a time. The remote manifest can select `max`, `admob`, or `levelplay`; Android ships **AppLovin MAX** plus the official Google/AdMob and Meta Audience Network mediation adapters.

MAX is the mediation layer. Google AdMob / Google Bidding and Meta Audience Network are configured as mediated demand sources in MAX rather than initialized independently by NekoAnimes. This avoids multiple SDKs racing to show the same placement.

## Formats

- Banner: native Android slot above the bottom navigation.
- App Open: managed by the native shell with skip-first-opens and cooldown policy.
- Interstitial: triggered only from semantic product events and capped by cooldown + maximum impressions per session.

The SPA never calls `showInterstitial()` directly. It only emits product events through NekoBridge. Native `NekoAdOrchestrator` owns policy and presentation.

## Remote controls

`/v1/app-manifest` controls:

- global ads enabled flag;
- active mediation engine;
- banner enabled;
- App Open enabled, minimum interval, first opens to skip;
- interstitial enabled, minimum interval, maximum per session.

If configuration, consent, SDK key, or required ad-unit ID is unavailable, that format stays disabled.

## Privacy

Android integrates Google UMP. Consent information is refreshed before MAX initialization. Ads are only initialized when the consent layer reports that ad requests can be made.

A privacy-options entry point should be exposed from Account/Settings in Stage 12 when account/settings navigation is added.

## Android build properties

Keep credentials and ad-unit identifiers outside source control and provide them as Gradle properties:

- `MAX_SDK_KEY`
- `MAX_BANNER_AD_UNIT_ID`
- `MAX_APP_OPEN_AD_UNIT_ID`
- `MAX_INTERSTITIAL_AD_UNIT_ID`
- `maxTestMode=true` (passed only to a local/CI test build)
- `maxTestDeviceAdvertisingId=<test device GAID>` (passed only to a local/CI test build)
- `googleAdMobAppId=<AdMob application ID>`

Without these values, monetization remains fail-closed.

## Mediated networks

Initial production plan:

1. AppLovin Exchange / MAX demand.
2. Google Bidding / AdMob through MAX.
3. Meta Audience Network through MAX.

Network accounts, approval, partner bidding/ad-unit setup and MAX dashboard credentials are operational prerequisites, not source-code configuration. The current repository has no MAX SDK key or ad-unit IDs, so the remote staging manifest must remain disabled until those values are supplied through protected CI/Gradle settings.

## Test procedure

1. Create one MAX Android app for `com.nekoanimes.app` and three MAX ad units: banner, app open and interstitial.
2. Connect AppLovin, Google/AdMob and Meta Audience Network in MAX and enable the three networks on the three ad units.
3. Add the physical device GAID to MAX Test Mode, selecting one network at a time.
4. Build with `-PmaxTestMode=true -PmaxTestDeviceAdvertisingId=<GAID>` and the protected MAX IDs.
5. Confirm `Test Mode On: true`, then verify the format and `network=` logs for each placement.

Test ads do not represent production impressions or revenue; they only validate the integration.

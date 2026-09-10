# Monetization — Stage 11

## Engine strategy

NekoAnimes uses one mediation engine at a time. The remote manifest can select `max`, `admob`, or `levelplay`, but Android currently ships the first production adapter for **AppLovin MAX**.

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

Without these values, monetization remains fail-closed.

## Mediated networks

Initial production plan:

1. AppLovin Exchange / MAX demand.
2. Google Bidding / AdMob through MAX.
3. Meta Audience Network through MAX.

Network accounts, approval, partner bidding/ad-unit setup and MAX dashboard credentials are operational prerequisites, not source-code configuration.

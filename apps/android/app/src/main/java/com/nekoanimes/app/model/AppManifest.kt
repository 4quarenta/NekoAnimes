package com.nekoanimes.app.model

data class AppManifest(
    val schemaVersion: Int,
    val configVersion: Int,
    val mode: Int,
    val webAppUrl: String,
    val navigation: List<NavigationItem>,
    val ads: AdsConfig
)

data class NavigationItem(
    val id: String,
    val label: String,
    val icon: String,
    val route: String
)

data class AdSlotConfig(
    val enabled: Boolean,
    val unitId: String
)

data class AdsConfig(
    val enabled: Boolean,
    val provider: String,
    val testMode: Boolean,
    val banner: AdSlotConfig,
    val appOpen: AdSlotConfig,
    val interstitial: AdSlotConfig,
    val appOpenMinIntervalMinutes: Int,
    val appOpenSkipFirstOpens: Int,
    val interstitialMinIntervalMinutes: Int,
    val interstitialMaxPerSession: Int,
    val interstitialPageTransitionFrequency: Int,
    val interstitialShowOnEpisodeStart: Boolean
) {
    companion object {
        fun disabled() = AdsConfig(
            enabled = false,
            provider = "admob",
            testMode = true,
            banner = AdSlotConfig(false, ""),
            appOpen = AdSlotConfig(false, ""),
            interstitial = AdSlotConfig(false, ""),
            appOpenMinIntervalMinutes = 60,
            appOpenSkipFirstOpens = 0,
            interstitialMinIntervalMinutes = 30,
            interstitialMaxPerSession = 2,
            interstitialPageTransitionFrequency = 3,
            interstitialShowOnEpisodeStart = true
        )
    }
}

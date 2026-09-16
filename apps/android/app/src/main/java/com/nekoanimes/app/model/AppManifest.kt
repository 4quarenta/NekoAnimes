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

data class AdsConfig(
    val enabled: Boolean,
    val engine: String,
    val banner: BannerAdConfig,
    val appOpen: AppOpenAdConfig,
    val interstitial: InterstitialAdConfig
)

data class BannerAdConfig(val enabled: Boolean)
data class AppOpenAdConfig(
    val enabled: Boolean,
    val minIntervalMinutes: Int,
    val skipFirstOpens: Int
)
data class InterstitialAdConfig(
    val enabled: Boolean,
    val minIntervalMinutes: Int,
    val maxPerSession: Int,
    val pageTransitionFrequency: Int,
    val showOnEpisodeStart: Boolean
)

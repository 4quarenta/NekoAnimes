package com.nekoanimes.app.data

import android.content.Context
import android.net.Uri
import com.nekoanimes.app.BuildConfig
import com.nekoanimes.app.model.AdSlotConfig
import com.nekoanimes.app.model.AdsConfig
import com.nekoanimes.app.model.AppManifest
import com.nekoanimes.app.model.NavigationItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class AppManifestRepository(context: Context) {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    suspend fun load(): Result<AppManifest> = withContext(Dispatchers.IO) {
        runCatching { fetchRemote() }.recoverCatching { error ->
            val cached = preferences.getString(CACHE_KEY, null)
                ?: throw IllegalStateException("Configuração remota indisponível e nenhum cache válido foi encontrado", error)
            parse(cached)
        }
    }

    private fun fetchRemote(): AppManifest {
        val connection = URL("${BuildConfig.API_BASE_URL}/v1/app-manifest").openConnection() as HttpURLConnection
        connection.connectTimeout = 4_000
        connection.readTimeout = 4_000
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")
        try {
            if (connection.responseCode !in 200..299) error("HTTP ${connection.responseCode}")
            val raw = connection.inputStream.bufferedReader().use { it.readText() }
            val manifest = parse(raw)
            preferences.edit().putString(CACHE_KEY, raw).apply()
            return manifest
        } finally { connection.disconnect() }
    }

    private fun parse(raw: String): AppManifest {
        val json = JSONObject(raw)
        val schemaVersion = json.getInt("schemaVersion")
        require(schemaVersion == 1) { "schemaVersion não suportada: $schemaVersion" }
        val mode = json.getInt("mode")
        require(mode == 1 || mode == 2) { "Modo inválido" }
        val webAppUrl = json.getString("webAppUrl")
        require(isTrustedWebAppUrl(webAppUrl)) { "Origem web não permitida" }

        val navigationJson = json.getJSONArray("navigation")
        require(navigationJson.length() in 1..8) { "Navbar inválida" }
        val navigation = buildList {
            for (index in 0 until navigationJson.length()) {
                val item = navigationJson.getJSONObject(index)
                val route = item.getString("route")
                require(route.startsWith("/")) { "Rota nativa inválida" }
                add(NavigationItem(item.getString("id"), item.getString("label"), item.getString("icon"), route))
            }
        }

        return AppManifest(schemaVersion, json.getInt("configVersion"), mode, webAppUrl, navigation, parseAds(json.optJSONObject("ads")))
    }

    private fun parseAds(json: JSONObject?): AdsConfig {
        if (json == null) return AdsConfig.disabled()
        val defaults = AdsConfig.disabled()
        return AdsConfig(
            enabled = json.optBoolean("enabled", defaults.enabled),
            provider = json.optString("provider", defaults.provider),
            testMode = json.optBoolean("testMode", defaults.testMode),
            banner = parseSlot(json.optJSONObject("banner"), defaults.banner),
            appOpen = parseSlot(json.optJSONObject("appOpen"), defaults.appOpen),
            interstitial = parseSlot(json.optJSONObject("interstitial"), defaults.interstitial),
            appOpenMinIntervalMinutes = json.optInt("appOpenMinIntervalMinutes", defaults.appOpenMinIntervalMinutes).coerceIn(0, 24 * 60),
            appOpenSkipFirstOpens = json.optInt("appOpenSkipFirstOpens", defaults.appOpenSkipFirstOpens).coerceIn(0, 100),
            interstitialMinIntervalMinutes = json.optInt("interstitialMinIntervalMinutes", defaults.interstitialMinIntervalMinutes).coerceIn(0, 24 * 60),
            interstitialMaxPerSession = json.optInt("interstitialMaxPerSession", defaults.interstitialMaxPerSession).coerceIn(0, 100),
            interstitialPageTransitionFrequency = json.optInt("interstitialPageTransitionFrequency", defaults.interstitialPageTransitionFrequency).coerceAtLeast(1).coerceAtMost(100),
            interstitialShowOnEpisodeStart = json.optBoolean("interstitialShowOnEpisodeStart", defaults.interstitialShowOnEpisodeStart)
        )
    }

    private fun parseSlot(json: JSONObject?, fallback: AdSlotConfig): AdSlotConfig {
        if (json == null) return fallback
        return AdSlotConfig(json.optBoolean("enabled", fallback.enabled), json.optString("unitId", fallback.unitId).trim().take(128))
    }

    private fun isTrustedWebAppUrl(url: String): Boolean {
        val candidate = Uri.parse(url)
        val allowed = Uri.parse(BuildConfig.WEB_APP_ORIGIN)
        return candidate.scheme == allowed.scheme && candidate.host == allowed.host && normalizedPort(candidate) == normalizedPort(allowed)
    }

    private fun normalizedPort(uri: Uri): Int = if (uri.port != -1) uri.port else if (uri.scheme == "https") 443 else 80

    private companion object {
        const val PREFERENCES_NAME = "neko_shell"
        const val CACHE_KEY = "last_known_good_manifest_v1"
    }
}

package com.nekoanimes.app.data

import android.content.Context
import android.net.Uri
import com.nekoanimes.app.BuildConfig
import com.nekoanimes.app.model.AdsConfig
import com.nekoanimes.app.model.AppManifest
import com.nekoanimes.app.model.AppOpenAdConfig
import com.nekoanimes.app.model.BannerAdConfig
import com.nekoanimes.app.model.InterstitialAdConfig
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
            parse(cached).withoutAds()
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

        val adsJson = json.getJSONObject("ads")
        val engine = adsJson.getString("engine")
        require(engine in setOf("max", "admob", "levelplay")) { "Motor de anúncios inválido" }
        val appOpenJson = adsJson.getJSONObject("appOpen")
        val interstitialJson = adsJson.getJSONObject("interstitial")
        val ads = AdsConfig(
            enabled = adsJson.getBoolean("enabled"),
            engine = engine,
            banner = BannerAdConfig(adsJson.getJSONObject("banner").getBoolean("enabled")),
            appOpen = AppOpenAdConfig(
                enabled = appOpenJson.getBoolean("enabled"),
                minIntervalMinutes = appOpenJson.getInt("minIntervalMinutes").coerceIn(0, 1440),
                skipFirstOpens = appOpenJson.getInt("skipFirstOpens").coerceIn(0, 20)
            ),
            interstitial = InterstitialAdConfig(
                enabled = interstitialJson.getBoolean("enabled"),
                minIntervalMinutes = interstitialJson.getInt("minIntervalMinutes").coerceIn(0, 1440),
                maxPerSession = interstitialJson.getInt("maxPerSession").coerceIn(0, 20),
                pageTransitionFrequency = interstitialJson.optInt("pageTransitionFrequency", 3).coerceIn(0, 20),
                showOnEpisodeStart = interstitialJson.optBoolean("showOnEpisodeStart", true)
            )
        )

        return AppManifest(schemaVersion, json.getInt("configVersion"), mode, webAppUrl, navigation, ads.withoutAdsWhenDisabled())
    }

    private fun AdsConfig.withoutAdsWhenDisabled(): AdsConfig = if (enabled) this else copy(
        banner = banner.copy(enabled = false),
        appOpen = appOpen.copy(enabled = false),
        interstitial = interstitial.copy(enabled = false)
    )

    private fun AppManifest.withoutAds(): AppManifest = copy(ads = ads.copy(
        enabled = false,
        banner = ads.banner.copy(enabled = false),
        appOpen = ads.appOpen.copy(enabled = false),
        interstitial = ads.interstitial.copy(enabled = false)
    ))

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

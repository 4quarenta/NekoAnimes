package com.nekoanimes.app.data

import com.nekoanimes.app.BuildConfig
import com.nekoanimes.app.model.AppManifest
import com.nekoanimes.app.model.NavigationItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

class AppManifestRepository {
    suspend fun load(): AppManifest = withContext(Dispatchers.IO) {
        runCatching {
            val connection = URL("${BuildConfig.API_BASE_URL}/v1/app-manifest").openConnection() as HttpURLConnection
            connection.connectTimeout = 4_000
            connection.readTimeout = 4_000
            connection.requestMethod = "GET"
            connection.setRequestProperty("Accept", "application/json")

            try {
                if (connection.responseCode !in 200..299) error("HTTP ${connection.responseCode}")
                parse(connection.inputStream.bufferedReader().use { it.readText() })
            } finally {
                connection.disconnect()
            }
        }.getOrElse { fallback() }
    }

    private fun parse(raw: String): AppManifest {
        val json = JSONObject(raw)
        val navigationJson = json.getJSONArray("navigation")
        val navigation = buildList {
            for (index in 0 until navigationJson.length()) {
                val item = navigationJson.getJSONObject(index)
                add(NavigationItem(item.getString("id"), item.getString("label"), item.getString("icon"), item.getString("route")))
            }
        }
        return AppManifest(json.getString("mode"), json.optString("webAppUrl", BuildConfig.WEB_APP_URL), navigation)
    }

    private fun fallback(): AppManifest = AppManifest(
        mode = "streaming",
        webAppUrl = BuildConfig.WEB_APP_URL,
        navigation = listOf(
            NavigationItem("home", "Início", "home", "/"),
            NavigationItem("catalog", "A–Z", "catalog", "/catalogo"),
            NavigationItem("search", "Buscar", "search", "/buscar"),
            NavigationItem("library", "Lista", "library", "/lista")
        )
    )
}

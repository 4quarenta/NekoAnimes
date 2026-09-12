package com.nekoanimes.app.player

import com.nekoanimes.app.BuildConfig
import com.nekoanimes.app.bridge.PlayerSourceOverride
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

internal data class PlaybackSource(
    val url: String,
    val mimeType: String?,
    val label: String?,
    val headers: Map<String, String>
)

internal data class PlaybackDescriptor(
    val episodeId: String,
    val episodeNumber: Int,
    val title: String?,
    val source: PlaybackSource
)

internal class PlaybackRepository {
    fun load(episodeId: String, sourceOverride: PlayerSourceOverride? = null): PlaybackDescriptor {
        if (sourceOverride != null) {
            return PlaybackDescriptor(
                episodeId = episodeId,
                episodeNumber = 0,
                title = sourceOverride.label,
                source = PlaybackSource(sourceOverride.url, sourceOverride.mimeType, sourceOverride.label, sourceOverride.headers)
            )
        }
        val connection = URL("${BuildConfig.API_BASE_URL}/v1/catalog/episodes/$episodeId/playback")
            .openConnection() as HttpURLConnection
        connection.connectTimeout = 5_000
        connection.readTimeout = 8_000
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")

        try {
            val status = connection.responseCode
            if (status !in 200..299) error("Playback indisponível ($status)")
            val raw = connection.inputStream.bufferedReader().use { it.readText() }
            val root = JSONObject(raw)
            val episode = root.getJSONObject("episode")
            val sources = root.getJSONArray("sources")
            if (sources.length() == 0) error("Nenhuma fonte disponível")

            val source = sources.getJSONObject(0)
            val headerMap = mutableMapOf<String, String>()
            val headers = source.optJSONObject("headers") ?: JSONObject()
            headers.keys().forEach { key -> headerMap[key] = headers.optString(key) }

            return PlaybackDescriptor(
                episodeId = episode.getString("id"),
                episodeNumber = episode.getInt("number"),
                title = episode.optString("title").ifBlank { null },
                source = PlaybackSource(
                    url = source.getString("url"),
                    mimeType = source.optString("mimeType").ifBlank { null },
                    label = source.optString("label").ifBlank { null },
                    headers = headerMap
                )
            )
        } finally {
            connection.disconnect()
        }
    }
}

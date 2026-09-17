package com.nekoanimes.app.analytics

import android.content.Context
import android.os.Bundle
import android.net.Uri
import com.google.firebase.analytics.FirebaseAnalytics

/**
 * Small native analytics boundary.
 *
 * Firebase is optional until the NekoAnimes google-services.json is supplied.
 * No URLs, tokens, e-mail addresses or episode identifiers are sent.
 */
class NekoAnalytics(context: Context) {
    private val analytics: FirebaseAnalytics? = runCatching {
        FirebaseAnalytics.getInstance(context.applicationContext)
    }.getOrNull()

    fun appShellReady() {
        log("app_shell_ready")
    }

    fun screenViewed(route: String) {
        val path = safePath(route) ?: return
        analytics?.logEvent(FirebaseAnalytics.Event.SCREEN_VIEW, Bundle().apply {
            putString(FirebaseAnalytics.Param.SCREEN_NAME, path)
            putString(FirebaseAnalytics.Param.SCREEN_CLASS, "NekoWebView")
        })
    }

    fun playerOpened(episodeNumber: Int, hasPrevious: Boolean, hasNext: Boolean) {
        log("player_open", Bundle().apply {
            putInt("episode_number", episodeNumber.coerceAtLeast(0))
            putBoolean("has_previous", hasPrevious)
            putBoolean("has_next", hasNext)
        })
    }

    fun playerClosed(playbackReady: Boolean) {
        log("player_close", Bundle().apply { putBoolean("playback_ready", playbackReady) })
    }

    fun playerNavigation(direction: String) {
        if (direction != "previous" && direction != "next") return
        log("player_navigation", Bundle().apply { putString("direction", direction) })
    }

    fun appEvent(name: String, placement: String?) {
        if (name != "menu_open" && name != "review_request") return
        log("app_event", Bundle().apply {
            putString("event_name", name)
            placement?.takeIf { it.length <= 64 }?.let { putString("placement", it) }
        })
    }

    private fun log(name: String, params: Bundle? = null) {
        analytics?.logEvent(name, params)
    }

    private fun safePath(route: String): String? = runCatching {
        Uri.parse("https://nekoanimes.local$route").path
            ?.replace(Regex("[^/A-Za-z0-9_{}.-]"), "")
            ?.take(160)
            ?.ifBlank { "/" }
    }.getOrNull()
}

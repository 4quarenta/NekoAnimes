package com.nekoanimes.app.review

import android.util.Log
import androidx.activity.ComponentActivity
import androidx.lifecycle.Lifecycle
import com.google.android.play.core.review.ReviewManagerFactory

/** Requests the Play in-app review flow only after meaningful use. */
class NekoReviewRequester(private val activity: ComponentActivity) {
    private val preferences = activity.getSharedPreferences("neko_review", 0)
    private var lastRoute: String? = null
    private var requestInFlight = false
    private var playerOpen = false

    fun onRouteChanged(route: String) {
        if (route == lastRoute) return
        lastRoute = route
        if (!isEligibleRoute(route)) return
        val transitions = preferences.getInt(KEY_TRANSITIONS, 0) + 1
        preferences.edit().putInt(KEY_TRANSITIONS, transitions).apply()
        if (transitions < MIN_TRANSITIONS || playerOpen) return

        // Let the destination screen settle before presenting a Play-owned
        // dialog. This also prevents the request from competing with player
        // opening or a navigation animation.
        activity.window.decorView.postDelayed({ requestAutomatically() }, AUTO_REQUEST_DELAY_MS)
    }

    fun requestNow() {
        requestReview(force = true)
    }

    fun onPlayerOpened() {
        playerOpen = true
    }

    fun onPlayerClosed() {
        playerOpen = false
    }

    private fun requestAutomatically() {
        if (playerOpen || !activity.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) return
        requestReview()
    }

    private fun requestReview(force: Boolean = false) {
        if (requestInFlight || preferences.getBoolean(KEY_FLOW_COMPLETED, false) || (!force && !isEligibleForAutomaticRequest())) return
        val now = System.currentTimeMillis()
        // Failed requests (common on sideloaded debug APKs) may be retried,
        // but never on every route transition.
        if (!force && now - preferences.getLong(KEY_LAST_ATTEMPT, 0L) < ATTEMPT_COOLDOWN_MS) return
        requestInFlight = true
        preferences.edit().putLong(KEY_LAST_ATTEMPT, now).apply()

        val manager = ReviewManagerFactory.create(activity)
        manager.requestReviewFlow().addOnCompleteListener { request ->
            if (request.isSuccessful) {
                manager.launchReviewFlow(activity, request.result).addOnCompleteListener {
                    preferences.edit()
                        .putLong(KEY_LAST_REQUEST, System.currentTimeMillis())
                        .putBoolean(KEY_FLOW_COMPLETED, true)
                        .apply()
                    requestInFlight = false
                    Log.i(TAG, "Play in-app review flow finished")
                }
            } else {
                requestInFlight = false
                Log.i(TAG, "Play in-app review is not available on this install")
            }
        }
    }

    private fun isEligibleForAutomaticRequest(): Boolean {
        return !preferences.getBoolean(KEY_FLOW_COMPLETED, false) && System.currentTimeMillis() - preferences.getLong(KEY_LAST_REQUEST, 0L) >= COOLDOWN_MS
    }

    private fun isEligibleRoute(route: String): Boolean {
        return route != "/" && !route.startsWith("/conta") && !route.startsWith("/reportar") && !route.startsWith("/admin")
    }

    private companion object {
        const val TAG = "NekoReview"
        const val KEY_TRANSITIONS = "meaningful_transitions"
        const val KEY_LAST_ATTEMPT = "last_attempt"
        const val KEY_LAST_REQUEST = "last_request"
        const val KEY_FLOW_COMPLETED = "flow_completed"
        const val MIN_TRANSITIONS = 3
        const val AUTO_REQUEST_DELAY_MS = 700L
        const val ATTEMPT_COOLDOWN_MS = 6L * 60L * 60L * 1000L
        const val COOLDOWN_MS = 30L * 24L * 60L * 60L * 1000L
    }
}

package com.nekoanimes.app.review

import android.util.Log
import androidx.activity.ComponentActivity
import com.google.android.play.core.review.ReviewManagerFactory

/** Requests the Play in-app review flow only after meaningful use. */
class NekoReviewRequester(private val activity: ComponentActivity) {
    private val preferences = activity.getSharedPreferences("neko_review", 0)
    private var lastRoute: String? = null

    fun onRouteChanged(route: String) {
        if (route == lastRoute) return
        lastRoute = route
        val transitions = preferences.getInt(KEY_TRANSITIONS, 0) + 1
        preferences.edit().putInt(KEY_TRANSITIONS, transitions).apply()
        if (transitions < MIN_TRANSITIONS || System.currentTimeMillis() - preferences.getLong(KEY_LAST_REQUEST, 0L) < COOLDOWN_MS) return
        requestReview()
    }

    fun requestNow() {
        requestReview()
    }

    private fun requestReview() {
        preferences.edit().putLong(KEY_LAST_REQUEST, System.currentTimeMillis()).apply()

        val manager = ReviewManagerFactory.create(activity)
        manager.requestReviewFlow().addOnCompleteListener { request ->
            if (request.isSuccessful) {
                manager.launchReviewFlow(activity, request.result).addOnCompleteListener {
                    Log.i(TAG, "Play in-app review flow finished")
                }
            } else {
                Log.i(TAG, "Play in-app review is not available on this install")
            }
        }
    }

    private companion object {
        const val TAG = "NekoReview"
        const val KEY_TRANSITIONS = "meaningful_transitions"
        const val KEY_LAST_REQUEST = "last_request"
        const val MIN_TRANSITIONS = 5
        const val COOLDOWN_MS = 30L * 24L * 60L * 60L * 1000L
    }
}

package com.nekoanimes.app.player

internal const val MAX_PLAYBACK_SECONDS = 604800

/** Missing is compatible with bridge v1; explicit null, coercions and fractions are invalid. */
internal fun parseStartPositionSeconds(value: Any?, present: Boolean): Int {
    if (!present) return 0
    require(value is Number)
    val seconds = value.toDouble()
    require(seconds.isFinite() && seconds in 0.0..MAX_PLAYBACK_SECONDS.toDouble() && seconds % 1.0 == 0.0)
    return seconds.toInt()
}

internal data class PlaybackCheckpoint(val positionSeconds: Int, val durationSeconds: Int)

/** Readiness survives buffering, but an error invalidates this attempt until a fresh retry. */
internal class PlaybackProgress {
    private var prepared = false
    private var failed = false
    var lastCheckpoint: PlaybackCheckpoint? = null
        private set

    fun onReady() { if (!failed) prepared = true }
    fun onError() { failed = true }

    fun capture(positionMs: Long, durationMs: Long): PlaybackCheckpoint? {
        if (!prepared || failed || positionMs < 0 || durationMs < 1000 ||
            durationMs > MAX_PLAYBACK_SECONDS * 1000L) return null
        return PlaybackCheckpoint(
            (positionMs.coerceAtMost(durationMs) / 1000).toInt(),
            (durationMs / 1000).toInt()
        ).also { lastCheckpoint = it }
    }
}

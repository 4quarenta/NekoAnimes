package com.nekoanimes.app.player

import android.app.Activity
import android.content.pm.ActivityInfo
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
internal fun NekoPlayerScreen(
    episodeId: String,
    onClose: (positionSeconds: Int, durationSeconds: Int) -> Unit
) {
    val context = LocalContext.current
    val activity = context as Activity
    var state by remember(episodeId) { mutableStateOf<PlayerState>(PlayerState.Loading) }
    var activePlayer by remember(episodeId) { mutableStateOf<ExoPlayer?>(null) }

    DisposableEffect(activity, episodeId) {
        val window = activity.window
        val previousOrientation = activity.requestedOrientation
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        val previousBarsBehavior = controller.systemBarsBehavior
        val previousLightStatusBars = controller.isAppearanceLightStatusBars
        val previousLightNavigationBars = controller.isAppearanceLightNavigationBars

        activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
        WindowCompat.setDecorFitsSystemWindows(window, false)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())

        onDispose {
            controller.show(WindowInsetsCompat.Type.systemBars())
            controller.systemBarsBehavior = previousBarsBehavior
            controller.isAppearanceLightStatusBars = previousLightStatusBars
            controller.isAppearanceLightNavigationBars = previousLightNavigationBars
            WindowCompat.setDecorFitsSystemWindows(window, true)
            activity.requestedOrientation = previousOrientation
        }
    }

    fun closeWithProgress() {
        val player = activePlayer
        val position = ((player?.currentPosition ?: 0L) / 1000L).coerceAtLeast(0L).toInt()
        val durationMs = player?.duration ?: 0L
        val duration = if (durationMs > 0) (durationMs / 1000L).toInt() else 0
        onClose(position, duration)
    }

    BackHandler { closeWithProgress() }

    LaunchedEffect(episodeId) {
        state = runCatching {
            withContext(Dispatchers.IO) { PlaybackRepository().load(episodeId) }
        }.fold(
            onSuccess = { PlayerState.Ready(it) },
            onFailure = { PlayerState.Error(it.message ?: "Falha ao carregar episódio") }
        )
    }

    when (val current = state) {
        PlayerState.Loading -> Box(modifier = Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        is PlayerState.Error -> Box(modifier = Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) { Text(current.message, color = Color.White) }
        is PlayerState.Ready -> {
            val descriptor = current.descriptor
            val player = remember(descriptor.episodeId) {
                val httpFactory = DefaultHttpDataSource.Factory()
                    .setAllowCrossProtocolRedirects(false)
                    .setDefaultRequestProperties(descriptor.source.headers)
                ExoPlayer.Builder(context)
                    .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
                    .build()
                    .apply {
                        setHandleAudioBecomingNoisy(true)
                        val itemBuilder = MediaItem.Builder()
                            .setUri(Uri.parse(descriptor.source.url))
                            .setMediaMetadata(MediaMetadata.Builder().setTitle(descriptor.title ?: "Episódio ${descriptor.episodeNumber}").build())
                        descriptor.source.mimeType?.let { itemBuilder.setMimeType(normalizeMime(it)) }
                        setMediaItem(itemBuilder.build())
                        prepare()
                        playWhenReady = true
                    }
            }
            activePlayer = player

            DisposableEffect(player) {
                onDispose {
                    if (activePlayer === player) activePlayer = null
                    player.release()
                }
            }

            AndroidView(
                modifier = Modifier.fillMaxSize().background(Color.Black),
                factory = { viewContext -> PlayerView(viewContext).apply { this.player = player; useController = true; keepScreenOn = true } },
                update = { it.player = player }
            )
        }
    }
}

private fun normalizeMime(value: String): String = when (value.lowercase()) {
    "hls", "application/x-mpegurl", "application/vnd.apple.mpegurl" -> MimeTypes.APPLICATION_M3U8
    "dash", "application/dash+xml" -> MimeTypes.APPLICATION_MPD
    "mp4", "video/mp4" -> MimeTypes.VIDEO_MP4
    else -> value
}

private sealed interface PlayerState {
    data object Loading : PlayerState
    data class Ready(val descriptor: PlaybackDescriptor) : PlayerState
    data class Error(val message: String) : PlayerState
}

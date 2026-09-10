package com.nekoanimes.app.player

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
    onClose: () -> Unit
) {
    val context = LocalContext.current
    var state by remember(episodeId) { mutableStateOf<PlayerState>(PlayerState.Loading) }

    BackHandler { onClose() }

    LaunchedEffect(episodeId) {
        state = runCatching {
            withContext(Dispatchers.IO) { PlaybackRepository().load(episodeId) }
        }.fold(
            onSuccess = { PlayerState.Ready(it) },
            onFailure = { PlayerState.Error(it.message ?: "Falha ao carregar episódio") }
        )
    }

    when (val current = state) {
        PlayerState.Loading -> Box(
            modifier = Modifier.fillMaxSize().background(Color.Black),
            contentAlignment = Alignment.Center
        ) { CircularProgressIndicator() }

        is PlayerState.Error -> Box(
            modifier = Modifier.fillMaxSize().background(Color.Black),
            contentAlignment = Alignment.Center
        ) { Text(current.message, color = Color.White) }

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
                            .setMediaMetadata(
                                MediaMetadata.Builder()
                                    .setTitle(descriptor.title ?: "Episódio ${descriptor.episodeNumber}")
                                    .build()
                            )
                        descriptor.source.mimeType?.let { itemBuilder.setMimeType(normalizeMime(it)) }
                        setMediaItem(itemBuilder.build())
                        prepare()
                        playWhenReady = true
                    }
            }

            DisposableEffect(player) {
                onDispose { player.release() }
            }

            AndroidView(
                modifier = Modifier.fillMaxSize().background(Color.Black),
                factory = { viewContext ->
                    PlayerView(viewContext).apply {
                        this.player = player
                        useController = true
                        keepScreenOn = true
                    }
                },
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

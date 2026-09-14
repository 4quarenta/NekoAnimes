package com.nekoanimes.app.player

import android.app.Activity
import android.content.pm.ActivityInfo
import android.net.Uri
import android.util.Log
import android.webkit.WebSettings
import com.nekoanimes.app.BuildConfig
import com.nekoanimes.app.bridge.PlayerSourceOverride
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.hls.HlsMediaSource
import androidx.media3.ui.PlayerView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

@Composable
internal fun NekoPlayerScreen(
    episodeId: String,
    sourceOverride: PlayerSourceOverride? = null,
    startPositionSeconds: Int = 0,
    animeTitle: String? = null,
    episodeNumber: Int = 0,
    hasPreviousEpisode: Boolean = false,
    hasNextEpisode: Boolean = false,
    playbackBlocked: Boolean = false,
    onProgress: (positionSeconds: Int, durationSeconds: Int) -> Unit,
    onClose: (positionSeconds: Int, durationSeconds: Int, playbackReady: Boolean) -> Unit,
    onNavigate: (direction: String, positionSeconds: Int, durationSeconds: Int, playbackReady: Boolean) -> Unit = { _, _, _, _ -> }
) {
    val context = LocalContext.current
    val activity = context as Activity
    var state by remember(episodeId, sourceOverride?.url) { mutableStateOf<PlayerState>(PlayerState.Loading) }
    var playbackError by remember(episodeId, sourceOverride?.url) { mutableStateOf<String?>(null) }
    var activePlayer by remember(episodeId, sourceOverride?.url) { mutableStateOf<ExoPlayer?>(null) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var foreground by remember { mutableStateOf(lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    var needsPlayIntent by remember(episodeId) { mutableStateOf(false) }
    var attempt by remember(episodeId) { mutableStateOf(0) }
    var navigationRequested by remember(episodeId, sourceOverride?.url) { mutableStateOf(false) }
    var resumePosition by remember(episodeId) { mutableStateOf(startPositionSeconds.coerceIn(0, MAX_PLAYBACK_SECONDS)) }
    val progress = remember(episodeId, sourceOverride?.url, attempt) { PlaybackProgress() }
    var lastPublished by remember(progress) { mutableStateOf<PlaybackCheckpoint?>(null) }
    val currentOnProgress by rememberUpdatedState(onProgress)
    val currentBlocked by rememberUpdatedState(playbackBlocked)
    val currentForeground by rememberUpdatedState(foreground)

    fun checkpoint(): PlaybackCheckpoint? {
        val player = activePlayer ?: return null
        if (player.playerError != null) return null
        return progress.capture(player.currentPosition, player.duration)
    }

    fun publishCheckpoint() {
        checkpoint()?.let {
            resumePosition = it.positionSeconds
            if (it != lastPublished) {
                lastPublished = it
                currentOnProgress(it.positionSeconds, it.durationSeconds)
            }
        }
    }

    DisposableEffect(lifecycle, activePlayer, progress) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> foreground = true
                Lifecycle.Event.ON_PAUSE, Lifecycle.Event.ON_STOP -> {
                    publishCheckpoint()
                    foreground = false
                    needsPlayIntent = true
                    activePlayer?.pause()
                }
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(playbackBlocked, activePlayer) {
        if (playbackBlocked) {
            publishCheckpoint()
            needsPlayIntent = true
            activePlayer?.pause()
        }
    }

    LaunchedEffect(activePlayer, progress) {
        while (true) {
            delay(15_000)
            if (activePlayer?.isPlaying == true) publishCheckpoint()
        }
    }

    DisposableEffect(activity, episodeId, sourceOverride?.url) {
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
        val saved = checkpoint()
        activePlayer?.pause()
        onClose(saved?.positionSeconds ?: 0, saved?.durationSeconds ?: 0, saved != null)
    }

    fun navigateToEpisode(direction: String) {
        if (navigationRequested) return
        val saved = checkpoint()
        navigationRequested = true
        onNavigate(direction, saved?.positionSeconds ?: 0, saved?.durationSeconds ?: 0, saved != null)
    }

    fun retry() {
        resumePosition = progress.lastCheckpoint?.positionSeconds ?: resumePosition
        activePlayer?.pause()
        playbackError = null
        state = PlayerState.Loading
        needsPlayIntent = false
        attempt += 1
    }

    BackHandler { closeWithProgress() }

    LaunchedEffect(episodeId, sourceOverride?.url, attempt, playbackBlocked) {
        if (playbackBlocked || state !is PlayerState.Loading) return@LaunchedEffect
        playbackError = null
        state = runCatching {
            withContext(Dispatchers.IO) { PlaybackRepository().load(activity, episodeId, sourceOverride) }
        }.fold(
            onSuccess = { PlayerState.Ready(it) },
            onFailure = {
                if (it is CancellationException) throw it
                PlayerState.Error(it.message ?: "Falha ao carregar episódio")
            }
        )
    }

    when (val current = state) {
        PlayerState.Loading -> Box(modifier = Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        is PlayerState.Error -> PlayerMessage(current.message, "Tentar novamente", !playbackBlocked && foreground, ::retry, ::closeWithProgress)
        is PlayerState.Ready -> {
            val descriptor = current.descriptor
            val player = remember(descriptor.episodeId, descriptor.source.url, attempt) {
                val bloggerMedia = isGoogleVideoSource(descriptor.source.url)
                val httpFactory = DefaultHttpDataSource.Factory()
                    .setUserAgent(
                        if (bloggerMedia) WebSettings.getDefaultUserAgent(context)
                        else "NekoAnimes/${BuildConfig.VERSION_NAME}"
                    )
                    .setConnectTimeoutMs(10_000)
                    .setReadTimeoutMs(15_000)
                    .setAllowCrossProtocolRedirects(false)
                    .setDefaultRequestProperties(
                        if (bloggerMedia) mapOf("Referer" to "https://www.blogger.com/")
                        else descriptor.source.headers
                    )
                ExoPlayer.Builder(context)
                    .setMediaSourceFactory(DefaultMediaSourceFactory(httpFactory))
                    .build()
                    .apply {
                        setHandleAudioBecomingNoisy(true)
                        val itemBuilder = MediaItem.Builder()
                            .setUri(Uri.parse(descriptor.source.url))
                            .setMediaMetadata(MediaMetadata.Builder().setTitle(descriptor.title ?: "Episódio ${descriptor.episodeNumber}").build())
                        descriptor.source.mimeType?.let { itemBuilder.setMimeType(normalizeMime(it)) }
                        val mediaItem = itemBuilder.build()
                        if (isHlsSource(descriptor.source.url, descriptor.source.mimeType)) {
                            setMediaSource(HlsMediaSource.Factory(httpFactory).createMediaSource(mediaItem))
                        } else {
                            setMediaSource(DefaultMediaSourceFactory(httpFactory).createMediaSource(mediaItem))
                        }
                    }
            }
            activePlayer = player
            var buffering by remember(player) { mutableStateOf(player.playbackState == Player.STATE_BUFFERING || player.playbackState == Player.STATE_IDLE) }

            DisposableEffect(player) {
                val listener = object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        if (playbackState == Player.STATE_READY) progress.onReady()
                        if (playbackState == Player.STATE_ENDED) publishCheckpoint()
                        buffering = playbackState == Player.STATE_BUFFERING || (playbackState == Player.STATE_IDLE && player.playerError == null)
                    }
                    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
                        if (playWhenReady && (currentBlocked || !currentForeground)) {
                            needsPlayIntent = true
                            player.pause()
                        } else if (!playWhenReady) {
                            publishCheckpoint()
                        }
                    }
                    override fun onPlayerError(error: PlaybackException) {
                        progress.onError()
                        buffering = false
                        val detail = error.message?.takeIf { it.isNotBlank() } ?: error.errorCodeName
                        playbackError = detail
                        Log.e("NekoPlayer", "ExoPlayer falhou: ${error.errorCodeName}", error)
                    }
                }
                player.addListener(listener)
                player.seekTo(resumePosition * 1000L)
                player.prepare()
                player.playWhenReady = !currentBlocked && currentForeground && !needsPlayIntent
                onDispose {
                    publishCheckpoint()
                    player.removeListener(listener)
                    if (activePlayer === player) activePlayer = null
                    player.release()
                }
            }

            Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { viewContext -> PlayerView(viewContext).apply { this.player = player; useController = true } },
                    update = { it.player = player; it.keepScreenOn = !playbackBlocked && foreground && !needsPlayIntent && playbackError == null }
                )
                if (buffering && playbackError == null) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = Color(0xFFA78BFA))
                }
                playbackError?.let { error ->
                    PlayerMessage("Não foi possível reproduzir este vídeo.\n$error", "Tentar novamente", !playbackBlocked && foreground, ::retry, ::closeWithProgress)
                }
                if (needsPlayIntent && !playbackBlocked && playbackError == null) {
                    PlayerMessage("Reprodução pausada", "Continuar reprodução", foreground, {
                        needsPlayIntent = false
                        player.play()
                    }, ::closeWithProgress)
                }
                if (!animeTitle.isNullOrBlank() || episodeNumber > 0) {
                    Column(
                        modifier = Modifier
                            .align(Alignment.TopStart)
                            .padding(20.dp)
                            .background(Color.Black.copy(alpha = .68f), RoundedCornerShape(12.dp))
                            .padding(horizontal = 14.dp, vertical = 10.dp)
                    ) {
                        if (!animeTitle.isNullOrBlank()) Text(animeTitle, color = Color.White, maxLines = 1)
                        if (episodeNumber > 0) Text("Episódio ${episodeNumber.toString().padStart(2, '0')}", color = Color(0xFFD8CCFF))
                    }
                }
                Row(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 28.dp)
                        .background(Color.Black.copy(alpha = .68f), RoundedCornerShape(14.dp))
                        .padding(horizontal = 8.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Button(
                        onClick = { navigateToEpisode("previous") },
                        enabled = hasPreviousEpisode && !navigationRequested && !playbackBlocked,
                        shape = RoundedCornerShape(10.dp)
                    ) { Text("‹ Anterior") }
                    Button(
                        onClick = { navigateToEpisode("next") },
                        enabled = hasNextEpisode && !navigationRequested && !playbackBlocked,
                        shape = RoundedCornerShape(10.dp)
                    ) { Text("Próximo ›") }
                }
            }
        }
    }
}

@Composable
private fun PlayerMessage(message: String, action: String, enabled: Boolean, onAction: () -> Unit, onBack: () -> Unit) {
    Box(Modifier.fillMaxSize().background(Color.Black).clickable { }, contentAlignment = Alignment.Center) {
        Column(Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(message, color = Color.White)
            Button(onClick = onAction, enabled = enabled) { Text(action) }
            Button(onClick = onBack) { Text("Voltar") }
        }
    }
}

private fun isHlsSource(url: String, mimeType: String?): Boolean =
    mimeType?.let(::normalizeMime) == MimeTypes.APPLICATION_M3U8 || Uri.parse(url).lastPathSegment?.contains(".m3u8", ignoreCase = true) == true

private fun isGoogleVideoSource(url: String): Boolean {
    val uri = Uri.parse(url)
    val host = uri.host?.lowercase() ?: return false
    return (host == "googlevideo.com" || host.endsWith(".googlevideo.com")) && uri.path == "/videoplayback"
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

package com.nekoanimes.app

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.nekoanimes.app.ads.NekoAdOrchestrator
import com.nekoanimes.app.ads.NekoBannerSlot
import com.nekoanimes.app.bridge.NekoBridge
import com.nekoanimes.app.data.AppManifestRepository
import com.nekoanimes.app.model.AppManifest
import com.nekoanimes.app.player.NekoPlayerScreen
import com.nekoanimes.app.ui.NekoNavigationBar
import com.nekoanimes.app.ui.NekoTheme
import com.nekoanimes.app.web.WebViewHost

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            NekoTheme {
                val repository = remember { AppManifestRepository(applicationContext) }
                var shellState by remember { mutableStateOf<ShellState>(ShellState.Loading) }
                var retryKey by remember { mutableIntStateOf(0) }
                LaunchedEffect(retryKey) {
                    shellState = ShellState.Loading
                    shellState = repository.load().fold(
                        onSuccess = { ShellState.Ready(it) },
                        onFailure = { ShellState.Error(it.message ?: "Falha ao carregar configuração") }
                    )
                }
                when (val state = shellState) {
                    ShellState.Loading -> LoadingScreen()
                    is ShellState.Error -> ErrorScreen(state.message) { retryKey += 1 }
                    is ShellState.Ready -> AppShell(state.manifest)
                }
            }
        }
    }
}

@Composable
private fun AppShell(manifest: AppManifest) {
    val activity = LocalContext.current as Activity
    var selectedRoute by remember(manifest.configVersion) { mutableStateOf("/") }
    var webView by remember(manifest.configVersion) { mutableStateOf<WebView?>(null) }
    var playerEpisodeId by remember(manifest.configVersion) { mutableStateOf<String?>(null) }
    var adsBootstrapped by remember(manifest.configVersion) { mutableStateOf(false) }

    val ads = remember(manifest.configVersion) { NekoAdOrchestrator(activity, manifest.ads) }
    val bridge = remember(manifest.configVersion) {
        NekoBridge(
            onRouteChanged = { route -> selectedRoute = route },
            onOpenPlayer = { episodeId -> playerEpisodeId = episodeId },
            onAppEvent = { name, placement -> ads.onAppEvent(name, placement) }
        )
    }

    LaunchedEffect(manifest.configVersion) {
        ads.initialize {
            ads.showAppOpenIfEligible()
            adsBootstrapped = true
        }
    }

    if (!adsBootstrapped) {
        LoadingScreen(message = if (manifest.ads.enabled) "Preparando experiência…" else null)
        return
    }

    val playing = playerEpisodeId
    if (playing != null) {
        NekoPlayerScreen(
            episodeId = playing,
            onClose = { positionSeconds, durationSeconds ->
                playerEpisodeId = null
                ads.onAppEvent("episode_closed", "player")
                webView?.let { bridge.sendPlayerClosed(it, playing, positionSeconds, durationSeconds) }
            }
        )
        return
    }

    BackHandler(enabled = webView?.canGoBack() == true) { webView?.goBack() }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            Column {
                NekoBannerSlot(manifest.ads)
                NekoNavigationBar(
                    items = manifest.navigation,
                    selectedRoute = selectedRoute,
                    onSelected = { item ->
                        selectedRoute = item.route
                        ads.onAppEvent("content_opened", item.id)
                        webView?.let { bridge.sendNavigation(it, item.route) }
                    }
                )
            }
        }
    ) { padding ->
        WebViewHost(
            url = manifest.webAppUrl,
            bridge = bridge,
            modifier = Modifier.fillMaxSize().padding(padding),
            onWebViewReady = { webView = it }
        )
    }
}

@Composable
private fun LoadingScreen(message: String? = null) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
            CircularProgressIndicator()
            if (message != null) Text(message)
        }
    }
}

@Composable
private fun ErrorScreen(message: String, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Não foi possível iniciar o NekoAnimes")
            Text(message)
            Button(onClick = onRetry) { Text("Tentar novamente") }
        }
    }
}

private sealed interface ShellState {
    data object Loading : ShellState
    data class Ready(val manifest: AppManifest) : ShellState
    data class Error(val message: String) : ShellState
}

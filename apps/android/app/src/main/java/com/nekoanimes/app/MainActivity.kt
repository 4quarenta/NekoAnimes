package com.nekoanimes.app

import android.os.Bundle
import android.util.Log
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
import androidx.compose.ui.unit.dp
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
                    is ShellState.Error -> ErrorScreen(
                        message = state.message,
                        onRetry = { retryKey += 1 }
                    )
                    is ShellState.Ready -> AppShell(state.manifest)
                }
            }
        }
    }
}

@Composable
private fun AppShell(manifest: AppManifest) {
    var selectedRoute by remember(manifest.configVersion) { mutableStateOf("/") }
    var webView by remember(manifest.configVersion) { mutableStateOf<WebView?>(null) }
    var playerEpisodeId by remember(manifest.configVersion) { mutableStateOf<String?>(null) }

    val bridge = remember(manifest.configVersion) {
        NekoBridge(
            onRouteChanged = { route -> selectedRoute = route },
            onOpenPlayer = { episodeId -> playerEpisodeId = episodeId },
            onAppEvent = { name, placement -> Log.i("NekoAppEvent", "Evento=$name placement=$placement") }
        )
    }

    val playing = playerEpisodeId
    if (playing != null) {
        NekoPlayerScreen(
            episodeId = playing,
            onClose = {
                playerEpisodeId = null
                webView?.let { bridge.sendPlayerClosed(it, playing) }
            }
        )
        return
    }

    BackHandler(enabled = webView?.canGoBack() == true) { webView?.goBack() }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        bottomBar = {
            NekoNavigationBar(
                items = manifest.navigation,
                selectedRoute = selectedRoute,
                onSelected = { item ->
                    selectedRoute = item.route
                    webView?.let { bridge.sendNavigation(it, item.route) }
                }
            )
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
private fun LoadingScreen() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
}

@Composable
private fun ErrorScreen(message: String, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
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

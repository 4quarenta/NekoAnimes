package com.nekoanimes.app

import android.app.Activity
import android.os.Bundle
import android.os.SystemClock
import android.webkit.WebView
import android.widget.Toast
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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.nekoanimes.app.ads.NekoAdOrchestrator
import com.nekoanimes.app.ads.NekoBannerSlot
import com.nekoanimes.app.bridge.NekoBridge
import com.nekoanimes.app.bridge.PlayerSourceOverride
import com.nekoanimes.app.data.AppManifestRepository
import com.nekoanimes.app.model.AppManifest
import com.nekoanimes.app.model.NavigationItem
import com.nekoanimes.app.player.NekoPlayerScreen
import com.nekoanimes.app.ui.NekoNavigationBar
import com.nekoanimes.app.ui.NekoNavigationDrawer
import com.nekoanimes.app.ui.NekoTheme
import com.nekoanimes.app.update.NekoUpdatePrompt
import com.nekoanimes.app.web.HorizontalSwipeDirection
import com.nekoanimes.app.web.WebViewHost
import kotlinx.coroutines.launch
import androidx.compose.material3.rememberDrawerState

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
    val activity = LocalContext.current as ComponentActivity
    NekoUpdatePrompt(activity)

    var selectedRoute by remember(manifest.configVersion) { mutableStateOf("/") }
    var currentWebRoute by remember(manifest.configVersion) { mutableStateOf("/") }
    var webView by remember(manifest.configVersion) { mutableStateOf<WebView?>(null) }
    var playerRequest by remember(manifest.configVersion) { mutableStateOf<PlayerRequest?>(null) }
    var playerReturnRoute by remember(manifest.configVersion) { mutableStateOf<String?>(null) }
    var adsBootstrapped by remember(manifest.configVersion) { mutableStateOf(false) }
    var lastBackPressedAt by remember { mutableLongStateOf(0L) }
    var showExitDialog by remember { mutableStateOf(false) }
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val drawerScope = rememberCoroutineScope()
    val primaryItems = remember(manifest.configVersion) {
        manifest.navigation.filterNot(::isDrawerItem)
    }
    val drawerItems = remember(manifest.configVersion) {
        manifest.navigation.filter(::isDrawerItem)
    }
    val currentWebRouteState by rememberUpdatedState(currentWebRoute)

    val ads = remember(manifest.configVersion) { NekoAdOrchestrator(activity, manifest.ads) }
    val bridge = remember(manifest.configVersion) {
        NekoBridge(
            onRouteChanged = { route ->
                currentWebRoute = route
                selectedRoute = route
            },
            onOpenPlayer = { episodeId, source ->
                drawerScope.launch {
                    drawerState.close()
                    playerReturnRoute = currentWebRouteState
                    playerRequest = PlayerRequest(episodeId, source)
                }
            },
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

    fun navigateTo(item: NavigationItem) {
        selectedRoute = item.route
        ads.onAppEvent("content_opened", item.id)
        webView?.let { bridge.sendNavigation(it, item.route) }
        drawerScope.launch { drawerState.close() }
    }

    val playing = playerRequest

    BackHandler(enabled = playing == null) {
        if (drawerState.isOpen) {
            lastBackPressedAt = 0L
            drawerScope.launch { drawerState.close() }
            return@BackHandler
        }

        val currentWebView = webView
        if (currentWebView?.canGoBack() == true) {
            lastBackPressedAt = 0L
            currentWebView.goBack()
            return@BackHandler
        }

        val now = SystemClock.elapsedRealtime()
        if (now - lastBackPressedAt <= 1_500L) {
            lastBackPressedAt = 0L
            showExitDialog = true
        } else {
            lastBackPressedAt = now
            Toast.makeText(activity, "Pressione voltar novamente para sair", Toast.LENGTH_SHORT).show()
        }
    }

    if (showExitDialog) {
        AlertDialog(
            onDismissRequest = { showExitDialog = false },
            title = { Text("Sair do NekoAnimes?") },
            text = { Text("Deseja fechar o aplicativo?") },
            confirmButton = {
                Button(onClick = { activity.finish() }) { Text("Sair") }
            },
            dismissButton = {
                TextButton(onClick = { showExitDialog = false }) { Text("Cancelar") }
            }
        )
    }

    fun navigateBySwipe(direction: HorizontalSwipeDirection) {
        val currentIndex = primaryItems.indexOfFirst { item ->
            if (item.route == "/") selectedRoute == "/" else selectedRoute.startsWith(item.route)
        }
        if (currentIndex < 0) return
        val targetIndex = currentIndex + if (direction == HorizontalSwipeDirection.Next) 1 else -1
        primaryItems.getOrNull(targetIndex)?.let(::navigateTo)
    }

    NekoNavigationDrawer(
        drawerState = drawerState,
        items = drawerItems,
        selectedRoute = selectedRoute,
        onSelected = ::navigateTo
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Scaffold(
                modifier = Modifier.fillMaxSize(),
                bottomBar = {
                    Column {
                        NekoBannerSlot(manifest.ads)
                        NekoNavigationBar(
                            items = primaryItems,
                            selectedRoute = selectedRoute,
                            onSelected = ::navigateTo
                        )
                    }
                }
            ) { padding ->
                WebViewHost(
                    url = manifest.webAppUrl,
                    bridge = bridge,
                    modifier = Modifier.fillMaxSize().padding(padding),
                    onHorizontalSwipe = ::navigateBySwipe,
                    onOpenDrawer = {
                        if (playerRequest == null) {
                            drawerScope.launch { drawerState.open() }
                        }
                    },
                    onWebViewReady = { webView = it }
                )
            }

            if (playing != null) {
                NekoPlayerScreen(
                    episodeId = playing.episodeId,
                    sourceOverride = playing.source,
                    onClose = { positionSeconds, durationSeconds ->
                        val returnRoute = playerReturnRoute
                        playerRequest = null
                        playerReturnRoute = null
                        ads.onAppEvent("episode_closed", "player")
                        webView?.let {
                            bridge.sendPlayerClosed(it, playing.episodeId, positionSeconds, durationSeconds)
                            if (!returnRoute.isNullOrBlank()) bridge.sendNavigation(it, returnRoute)
                        }
                    }
                )
            }
        }
    }
}

private data class PlayerRequest(val episodeId: String, val source: PlayerSourceOverride?)

private fun isDrawerItem(item: NavigationItem): Boolean = item.route == "/lista" || item.route == "/salvos" || item.route == "/conta"

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

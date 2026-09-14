package com.nekoanimes.app

import android.app.Activity
import android.content.res.Configuration
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.platform.LocalConfiguration
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
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            NekoTheme {
                val repository = remember { AppManifestRepository(applicationContext) }
                var shellState by remember { mutableStateOf<ShellState>(ShellState.Loading) }
                var retryKey by remember { mutableIntStateOf(0) }
                var resumeKey by remember { mutableIntStateOf(0) }
                val networkAccess = rememberNetworkAccess()
                DisposableEffect(this@MainActivity) {
                    val observer = LifecycleEventObserver { _, event ->
                        if (event == Lifecycle.Event.ON_RESUME) resumeKey += 1
                    }
                    lifecycle.addObserver(observer)
                    onDispose { lifecycle.removeObserver(observer) }
                }
                LaunchedEffect(retryKey) {
                    shellState = ShellState.Loading
                    shellState = repository.load().fold(
                        onSuccess = { ShellState.Ready(it) },
                        onFailure = { ShellState.Error(manifestLoadErrorMessage(it)) }
                    )
                }
                var lastAutomaticRetry by remember { mutableIntStateOf(-1) }
                LaunchedEffect(resumeKey, shellState) {
                    if (resumeKey > 0 && shellState is ShellState.Error && lastAutomaticRetry != resumeKey) {
                        lastAutomaticRetry = resumeKey
                        retryKey += 1
                    }
                }
                when (val state = shellState) {
                    ShellState.Loading -> LoadingScreen()
                    is ShellState.Error -> when (networkAccess) {
                        NetworkAccessState.Online -> ErrorScreen(state.message) { retryKey += 1 }
                        else -> ConnectionErrorScreen(connectionErrorMessage(networkAccess)) { retryKey += 1 }
                    }
                    // Once a valid manifest has been loaded, keep the shell and
                    // WebView alive across the short network transition caused
                    // by screen lock/unlock. Replacing the whole tree with an
                    // error screen destroys navigation state and made the app
                    // appear to require endless retries.
                    is ShellState.Ready -> AppShell(state.manifest, networkAccess)
                }
            }
        }
    }
}

@Composable
private fun AppShell(manifest: AppManifest, networkAccess: NetworkAccessState) {
    val activity = LocalContext.current as ComponentActivity
    NekoUpdatePrompt(activity)

    var selectedRoute by remember(manifest.configVersion) { mutableStateOf("/") }
    var currentWebRoute by remember(manifest.configVersion) { mutableStateOf("/") }
    var webView by remember(manifest.configVersion) { mutableStateOf<WebView?>(null) }
    var playerRequest by remember(manifest.configVersion) { mutableStateOf<PlayerRequest?>(null) }
    var playerReturnRoute by remember(manifest.configVersion) { mutableStateOf<String?>(null) }
    var playerOpening by remember(manifest.configVersion) { mutableStateOf(false) }
    var adsBootstrapped by remember(manifest.configVersion) { mutableStateOf(false) }
    var lastBackPressedAt by remember { mutableLongStateOf(0L) }
    var showExitDialog by remember { mutableStateOf(false) }
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val drawerScope = rememberCoroutineScope()
    val isPortrait = LocalConfiguration.current.orientation == Configuration.ORIENTATION_PORTRAIT
    val primaryItems = remember(manifest.configVersion) {
        manifest.navigation.filterNot(::isDrawerItem)
    }
    val drawerItems = remember(manifest.configVersion) {
        manifest.navigation.filter(::isDrawerItem).let { items ->
            if (manifest.mode == "streaming" && items.none { it.route == "/continuar" }) {
                items + NavigationItem("continue", "Continuar assistindo", "history", "/continuar")
            } else items
        }
    }
    val currentWebRouteState by rememberUpdatedState(currentWebRoute)
    val currentNetworkAccess by rememberUpdatedState(networkAccess)

    val ads = remember(manifest.configVersion) { NekoAdOrchestrator(activity, manifest.ads) }
    val bridge = remember(manifest.configVersion) {
        lateinit var instance: NekoBridge
        instance = NekoBridge(
            onRouteChanged = { route ->
                currentWebRoute = route
                selectedRoute = route
            },
            onOpenPlayer = { episodeId, source, startPositionSeconds, animeTitle, episodeNumber, hasPreviousEpisode, hasNextEpisode ->
                if (currentNetworkAccess != NetworkAccessState.Online) {
                    webView?.let { bridgeView ->
                        // Complete the web request without claiming a valid playback checkpoint.
                        // The network overlay explains why playback was blocked.
                        instance.sendPlayerClosed(bridgeView, episodeId, playbackReady = false)
                    }
                } else if (playerRequest == null && !playerOpening) {
                    playerOpening = true
                    // The SPA route is authoritative because WebView.url can
                    // still point at the shell after a history.pushState.
                    playerReturnRoute = currentWebRouteState.takeIf { it != "/" }
                        ?: webView?.let(::routeFromWebView)
                        ?: currentWebRouteState
                    drawerScope.launch {
                        drawerState.close()
                        playerRequest = PlayerRequest(episodeId, source, startPositionSeconds, animeTitle, episodeNumber, hasPreviousEpisode, hasNextEpisode)
                        playerOpening = false
                    }
                }
            },
            onAppEvent = { name, placement ->
                if (name == "menu_open") {
                    if (playerRequest == null && !playerOpening && currentNetworkAccess == NetworkAccessState.Online) {
                        drawerScope.launch { drawerState.open() }
                    }
                } else ads.onAppEvent(name, placement)
            }
        )
        instance
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

    LaunchedEffect(playerRequest) {
        if (playerRequest != null) drawerState.close()
    }

    fun navigateTo(item: NavigationItem) {
        if (currentNetworkAccess != NetworkAccessState.Online) return
        selectedRoute = item.route
        ads.onAppEvent("content_opened", item.id)
        webView?.let { bridge.sendNavigation(it, item.route) }
        drawerScope.launch { drawerState.close() }
    }

    val playing = playerRequest
    val navigationVisible = playing == null && !playerOpening && isPortrait

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

    Box(modifier = Modifier.fillMaxSize()) {
        // Keep the WebView mounted while the native player is visible. If it
        // is removed here, closing the player recreates it at the manifest URL
        // (the home page) and the return navigation is sent to a stale view.
        NekoNavigationDrawer(
            drawerState = drawerState,
            items = drawerItems,
            selectedRoute = selectedRoute,
            onSelected = ::navigateTo
        ) {
            Scaffold(
                modifier = Modifier.fillMaxSize(),
                bottomBar = {
                    if (navigationVisible) {
                        Column {
                            NekoBannerSlot(manifest.ads)
                            NekoNavigationBar(
                                items = primaryItems,
                                selectedRoute = selectedRoute,
                                onSelected = ::navigateTo
                            )
                        }
                    }
                }
            ) { padding ->
                WebViewHost(
                    url = manifest.webAppUrl,
                    bridge = bridge,
                    networkAvailable = networkAccess == NetworkAccessState.Online,
                    modifier = Modifier.fillMaxSize().padding(padding),
                    onHorizontalSwipe = ::navigateBySwipe,
                    gesturesEnabled = navigationVisible,
                    onOpenDrawer = {
                        if (navigationVisible && !drawerState.isOpen) {
                            drawerScope.launch { drawerState.open() }
                        }
                    },
                    onWebViewReady = { webView = it }
                )
            }
        }

        if (playing != null) {
            NekoPlayerScreen(
                episodeId = playing.episodeId,
                sourceOverride = playing.source,
                startPositionSeconds = playing.startPositionSeconds,
                animeTitle = playing.animeTitle,
                episodeNumber = playing.episodeNumber,
                hasPreviousEpisode = playing.hasPreviousEpisode,
                hasNextEpisode = playing.hasNextEpisode,
                playbackBlocked = networkAccess != NetworkAccessState.Online,
                onProgress = { positionSeconds, durationSeconds ->
                    webView?.let { bridge.sendPlayerProgress(it, playing.episodeId, positionSeconds, durationSeconds) }
                },
                onClose = { positionSeconds, durationSeconds, playbackReady ->
                    if (!playerOpening) {
                        playerOpening = true
                        val returnRoute = playerReturnRoute
                        drawerScope.launch {
                            drawerState.close()
                            playerRequest = null
                            playerReturnRoute = null
                            ads.onAppEvent("episode_closed", "player")
                            webView?.let {
                                bridge.sendPlayerClosed(it, playing.episodeId, positionSeconds, durationSeconds, playbackReady)
                                if (!returnRoute.isNullOrBlank()) bridge.sendNavigation(it, returnRoute)
                            }
                            playerOpening = false
                        }
                    }
                },
                onNavigate = { direction, positionSeconds, durationSeconds, playbackReady ->
                    if (!playerOpening) {
                        playerOpening = true
                        drawerScope.launch {
                            drawerState.close()
                            playerRequest = null
                            playerReturnRoute = null
                            ads.onAppEvent("episode_navigate", direction)
                            webView?.let {
                                bridge.sendPlayerClosed(it, playing.episodeId, positionSeconds, durationSeconds, playbackReady)
                                bridge.sendPlayerNavigate(it, direction)
                            }
                            playerOpening = false
                        }
                    }
                }
            )
        } else if (!navigationVisible) {
            Box(modifier = Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color.Black))
        }
        if (networkAccess != NetworkAccessState.Online) {
            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).clickable { }, contentAlignment = Alignment.Center) {
                Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(if (networkAccess == NetworkAccessState.Vpn) "VPN detectada" else "Sem conexão com a internet")
                    Text(connectionErrorMessage(networkAccess))
                    Text("A tela será recuperada quando a conexão estiver disponível.")
                }
            }
        }
    }
}

private data class PlayerRequest(
    val episodeId: String,
    val source: PlayerSourceOverride?,
    val startPositionSeconds: Int,
    val animeTitle: String?,
    val episodeNumber: Int,
    val hasPreviousEpisode: Boolean,
    val hasNextEpisode: Boolean
)

private fun isDrawerItem(item: NavigationItem): Boolean = item.route == "/lista" || item.route == "/salvos" || item.route == "/conta" || item.route == "/servidores" || item.route == "/continuar"

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

@Composable
private fun ConnectionErrorScreen(message: String, onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("Sem conexão com a internet")
            Text(message)
            Button(onClick = onRetry) { Text("Tentar novamente") }
        }
    }
}

private fun connectionErrorMessage(access: NetworkAccessState): String = when (access) {
    NetworkAccessState.Vpn -> "A conexão por VPN está bloqueada. Desative a VPN e tente novamente."
    NetworkAccessState.Offline -> "Conecte-se à internet e tente novamente."
    NetworkAccessState.Online -> "Verifique a conexão e tente novamente."
}

private fun manifestLoadErrorMessage(error: Throwable): String {
    val root = generateSequence(error) { it.cause }.last()
    return when (root) {
        is UnknownHostException -> "Não foi possível localizar a API de configuração. Verifique a conexão DNS e tente novamente."
        is SocketTimeoutException -> "A API de configuração demorou para responder. Verifique a conexão e tente novamente."
        is ConnectException -> "Não foi possível conectar à API de configuração. Verifique a conexão e tente novamente."
        else -> root.message?.trim()?.takeIf { it.isNotEmpty() }?.let { "Falha ao carregar a configuração: $it" }
            ?: "Falha ao carregar a configuração remota. Verifique a conexão e tente novamente."
    }
}

@Composable
private fun rememberNetworkAccess(): NetworkAccessState {
    val context = LocalContext.current.applicationContext
    val connectivity = remember(context) { context.getSystemService(ConnectivityManager::class.java) }
    var access by remember(connectivity) { mutableStateOf(readNetworkAccess(connectivity)) }

    DisposableEffect(connectivity) {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                access = readNetworkAccess(connectivity)
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                access = readNetworkAccess(connectivity)
            }

            override fun onLost(network: Network) {
                access = readNetworkAccess(connectivity)
            }
        }

        runCatching { connectivity.registerDefaultNetworkCallback(callback) }
        onDispose { runCatching { connectivity.unregisterNetworkCallback(callback) } }
    }

    return access
}

private enum class NetworkAccessState {
    Online,
    Offline,
    Vpn
}

private fun readNetworkAccess(connectivity: ConnectivityManager): NetworkAccessState {
    val network = connectivity.activeNetwork ?: return NetworkAccessState.Offline
    val capabilities = connectivity.getNetworkCapabilities(network) ?: return NetworkAccessState.Offline
    if (capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return NetworkAccessState.Vpn
    return if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
        capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    ) NetworkAccessState.Online else NetworkAccessState.Offline
}

private fun routeFromWebView(webView: WebView): String? {
    val url = webView.url ?: return null
    val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return null
    val path = uri.encodedPath?.takeIf { it.startsWith("/") } ?: return null
    val query = uri.encodedQuery?.takeIf { it.isNotBlank() }
    return if (query == null) path else "$path?$query"
}

private sealed interface ShellState {
    data object Loading : ShellState
    data class Ready(val manifest: AppManifest) : ShellState
    data class Error(val message: String) : ShellState
}

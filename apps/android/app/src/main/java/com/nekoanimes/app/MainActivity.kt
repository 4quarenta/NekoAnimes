package com.nekoanimes.app

import android.os.Bundle
import android.util.Log
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.nekoanimes.app.bridge.NekoBridge
import com.nekoanimes.app.data.AppManifestRepository
import com.nekoanimes.app.model.AppManifest
import com.nekoanimes.app.ui.NekoNavigationBar
import com.nekoanimes.app.ui.NekoTheme
import com.nekoanimes.app.web.WebViewHost

class MainActivity : ComponentActivity() {
    private val manifestRepository = AppManifestRepository()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            NekoTheme {
                var manifest by remember { mutableStateOf<AppManifest?>(null) }
                var selectedRoute by remember { mutableStateOf("/") }
                var webView by remember { mutableStateOf<WebView?>(null) }

                val bridge = remember {
                    NekoBridge(
                        onRouteChanged = { route -> selectedRoute = route },
                        onOpenPlayer = { episodeId ->
                            Log.i("NekoPlayer", "Solicitação de player: $episodeId")
                        },
                        onAdEvent = { event, placement ->
                            Log.i("NekoAds", "Evento=$event placement=$placement")
                        }
                    )
                }

                LaunchedEffect(Unit) {
                    manifest = manifestRepository.load()
                }

                val currentManifest = manifest

                if (currentManifest != null) {
                    Scaffold(
                        modifier = Modifier.fillMaxSize(),
                        bottomBar = {
                            NekoNavigationBar(
                                items = currentManifest.navigation,
                                selectedRoute = selectedRoute,
                                onSelected = { item ->
                                    selectedRoute = item.route
                                    webView?.let { bridge.sendNavigation(it, item.route) }
                                }
                            )
                        }
                    ) { padding ->
                        WebViewHost(
                            url = currentManifest.webAppUrl,
                            bridge = bridge,
                            modifier = Modifier.fillMaxSize().padding(padding),
                            onWebViewReady = { webView = it }
                        )
                    }
                }
            }
        }
    }
}

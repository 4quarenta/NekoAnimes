package com.nekoanimes.app.web

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.view.MotionEvent
import android.view.ViewConfiguration
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.RenderProcessGoneDetail
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.nekoanimes.app.BuildConfig
import com.nekoanimes.app.bridge.NekoBridge
import java.net.URI
import kotlin.math.abs

enum class HorizontalSwipeDirection {
    Previous,
    Next
}

@Composable
fun WebViewHost(
    url: String,
    bridge: NekoBridge,
    modifier: Modifier = Modifier,
    onHorizontalSwipe: (HorizontalSwipeDirection) -> Unit = {},
    onOpenDrawer: () -> Unit = {},
    gesturesEnabled: Boolean = true,
    networkAvailable: Boolean = true,
    onWebViewReady: (WebView) -> Unit
) {
    val currentOnHorizontalSwipe by rememberUpdatedState(onHorizontalSwipe)
    val currentOnOpenDrawer by rememberUpdatedState(onOpenDrawer)
    val currentGesturesEnabled = rememberUpdatedState(gesturesEnabled)
    val currentNetworkAvailable by rememberUpdatedState(networkAvailable)
    val recovery = remember { DocumentRecovery(url) }
    var documentError by remember { mutableStateOf<String?>(null) }
    var hostedView by remember { mutableStateOf<WebView?>(null) }
    var webViewGeneration by remember { mutableStateOf(0) }
    val lifecycle = LocalLifecycleOwner.current.lifecycle

    fun recoverDocument() {
        if (!currentNetworkAvailable || !lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) return
        val target = recovery.recoveryUrl() ?: return
        hostedView?.let { view ->
            recovery.started(target)
            documentError = null
            view.loadUrl(target)
        }
    }

    DisposableEffect(hostedView, lifecycle) {
        val view = hostedView
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_RESUME -> {
                    if (currentNetworkAvailable) view?.onResume()
                    recoverDocument()
                }
                Lifecycle.Event.ON_PAUSE -> view?.onPause()
                else -> Unit
            }
        }
        lifecycle.addObserver(observer)
        onDispose { lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(networkAvailable, hostedView) {
        if (networkAvailable) {
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) hostedView?.onResume()
            recoverDocument()
        } else {
            recovery.interrupted()
            hostedView?.stopLoading()
            hostedView?.onPause()
        }
    }

    Box(modifier) {
    key(webViewGeneration) {
    AndroidView(
        modifier = Modifier.fillMaxSize(),
        factory = { context ->
            NekoRefreshLayout(context).apply {
                setColorSchemeColors(0xFF8B5CF6.toInt())
                val container = this
                val webView = WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT
                    settings.javaScriptCanOpenWindowsAutomatically = false
                    settings.setSupportMultipleWindows(false)
                    settings.userAgentString = "${settings.userAgentString} NekoAnimes/Android"
                    var downX = 0f
                    var downY = 0f
                    var hasTouchDown = false
                    val drawerEdgeZone = 96f * context.resources.displayMetrics.density
                    val swipeThreshold = 96f * context.resources.displayMetrics.density

                    setOnTouchListener { _, event ->
                        when (event.actionMasked) {
                            MotionEvent.ACTION_DOWN -> {
                                downX = event.rawX
                                downY = event.rawY
                                hasTouchDown = true
                            }
                            MotionEvent.ACTION_UP -> {
                                if (!hasTouchDown) return@setOnTouchListener false
                                val deltaX = event.rawX - downX
                                val deltaY = event.rawY - downY
                                hasTouchDown = false
                                if (!currentGesturesEnabled.value) return@setOnTouchListener false
                                val isHorizontalSwipe = abs(deltaX) >= swipeThreshold && abs(deltaX) > abs(deltaY) * 1.35f
                                if (isHorizontalSwipe) {
                                    val startedAtDrawerEdge = downX <= drawerEdgeZone
                                    val startedAwayFromEdges = downX > drawerEdgeZone && downX < width - drawerEdgeZone
                                    if (startedAtDrawerEdge && deltaX > 0) {
                                        currentOnOpenDrawer()
                                    } else if (startedAwayFromEdges) {
                                        currentOnHorizontalSwipe(
                                            if (deltaX < 0) HorizontalSwipeDirection.Next else HorizontalSwipeDirection.Previous
                                        )
                                    }
                                }
                            }
                            MotionEvent.ACTION_CANCEL -> {
                                downX = 0f
                                downY = 0f
                                hasTouchDown = false
                            }
                        }
                        false
                    }

                    webViewClient = object : WebViewClient() {
                        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                            // A renderer-gone WebView must never be reused. Remove and
                            // destroy it, then let Compose create a fresh instance.
                            view.stopLoading()
                            (view.parent as? ViewGroup)?.removeView(view)
                            view.destroy()
                            if (hostedView === view) hostedView = null
                            container.hostedWebView = null
                            recovery.failed(recovery.lastUrl)
                            documentError = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && detail.didCrash()) {
                                "A página encontrou um erro interno. Ela será recarregada."
                            } else {
                                "A página foi encerrada pelo sistema por falta de memória. Ela será recarregada."
                            }
                            webViewGeneration += 1
                            return true
                        }

                        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                            if (url != null && isAllowedWebAppUrl(Uri.parse(url))) {
                                recovery.started(url)
                                documentError = null
                                if (!currentNetworkAvailable) {
                                    recovery.interrupted()
                                    view.stopLoading()
                                }
                            }
                        }

                        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
                            if (url != null && isAllowedWebAppUrl(Uri.parse(url))) recovery.visited(url)
                        }

                        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                            if (!request.isForMainFrame || !isAllowedWebAppUrl(request.url)) return
                            recovery.failed(request.url.toString())
                            if (recovery.failedUrl != request.url.toString()) return
                            container.isRefreshing = false
                            documentError = "Não foi possível carregar esta página. Verifique sua conexão e tente novamente."
                        }

                        override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, errorResponse: WebResourceResponse) {
                            if (!request.isForMainFrame || !isAllowedWebAppUrl(request.url)) return
                            recovery.failed(request.url.toString())
                            if (recovery.failedUrl != request.url.toString()) return
                            container.isRefreshing = false
                            documentError = "O servidor não conseguiu carregar esta página (HTTP ${errorResponse.statusCode})."
                        }

                        override fun onPageFinished(view: WebView, url: String?) {
                            if (url != null) recovery.finished(url)
                            container.isRefreshing = false
                        }

                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                            val target = request.url
                            if (!currentNetworkAvailable && request.isForMainFrame) return true
                            return if (isAllowedWebAppUrl(target)) {
                                false
                            } else {
                                try {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, target))
                                } catch (_: ActivityNotFoundException) {
                                    // Sem handler externo: a navegação continua bloqueada no WebView.
                                }
                                true
                            }
                        }
                    }

                }

                hostedWebView = webView
                addView(webView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                setOnChildScrollUpCallback { _, _ -> webView.canScrollVertically(-1) }
                setOnRefreshListener {
                    if (currentNetworkAvailable) {
                        val target = recovery.failedUrl ?: recovery.lastUrl
                        recovery.started(target)
                        documentError = null
                        webView.loadUrl(target)
                    } else isRefreshing = false
                }
                bridge.attach(webView)
                hostedView = webView
                onWebViewReady(webView)
                // Attach the bridge before the first document can handshake.
                if (currentNetworkAvailable) {
                    val initialDocumentUrl = recovery.recoveryUrl() ?: url
                    recovery.started(initialDocumentUrl)
                    webView.loadUrl(initialDocumentUrl)
                }
            }
        },
        update = {
            it.isEnabled = networkAvailable && gesturesEnabled
            if (!networkAvailable) it.isRefreshing = false
        },
        onRelease = { container ->
            container.hostedWebView?.apply { stopLoading(); destroy() }
        }
    )
    }
        documentError?.let { message ->
            Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background).clickable { }, contentAlignment = Alignment.Center) {
                Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text("Não foi possível abrir a página")
                    Text(message)
                    Button(onClick = ::recoverDocument, enabled = networkAvailable) { Text("Tentar novamente") }
                }
            }
        }
    }
}

private class NekoRefreshLayout(context: Context) : SwipeRefreshLayout(context) {
    var hostedWebView: WebView? = null

    private var refreshGestureAllowed = false
    private var horizontalGesture = false
    private var downX = 0f
    private var downY = 0f
    private val touchSlop = ViewConfiguration.get(context).scaledTouchSlop

    override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                downX = event.x
                downY = event.y
                horizontalGesture = false
                refreshGestureAllowed = event.y <= height * 0.40f
                if (!refreshGestureAllowed) return false
            }
            MotionEvent.ACTION_MOVE -> {
                val deltaX = event.x - downX
                val deltaY = event.y - downY
                if (!horizontalGesture && abs(deltaX) > touchSlop && abs(deltaX) > abs(deltaY)) {
                    horizontalGesture = true
                }
                if (horizontalGesture || !refreshGestureAllowed) return false
            }
            MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                if (!refreshGestureAllowed || horizontalGesture) {
                    resetGesture()
                    return false
                }
            }
        }

        val intercepted = super.onInterceptTouchEvent(event)
        if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) {
            resetGesture()
        }
        return intercepted
    }

    private fun resetGesture() {
        refreshGestureAllowed = false
        horizontalGesture = false
        downX = 0f
        downY = 0f
    }
}

private fun isAllowedWebAppUrl(uri: Uri): Boolean {
    return runCatching {
        val allowed = URI(BuildConfig.WEB_APP_ORIGIN)
        uri.scheme == allowed.scheme && uri.host == allowed.host &&
            normalizedPort(uri.scheme, uri.port) == normalizedPort(allowed.scheme, allowed.port)
    }.getOrDefault(false)
}

private fun normalizedPort(scheme: String?, port: Int): Int {
    if (port != -1) return port
    return if (scheme == "https") 443 else 80
}

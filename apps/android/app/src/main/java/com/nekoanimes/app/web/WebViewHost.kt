package com.nekoanimes.app.web

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.view.MotionEvent
import android.view.ViewGroup
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
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
    onWebViewReady: (WebView) -> Unit
) {
    AndroidView(
        modifier = modifier,
            factory = { context ->
            NekoRefreshLayout(context).apply {
                setColorSchemeColors(0xFF8B5CF6.toInt())
                val container = this
                val webView = WebView(context).apply {
                    settings.javaScriptEnabled = true
                    settings.domStorageEnabled = true
                    settings.allowFileAccess = false
                    settings.allowContentAccess = false
                    settings.javaScriptCanOpenWindowsAutomatically = false
                    settings.setSupportMultipleWindows(false)
                    settings.userAgentString = "${settings.userAgentString} NekoAnimes/Android"
                    var downX = 0f
                    var downY = 0f
                    var hasTouchDown = false
                    val edgeInset = 32f * context.resources.displayMetrics.density
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
                                val isHorizontalSwipe = abs(deltaX) >= swipeThreshold && abs(deltaX) > abs(deltaY) * 1.35f
                                if (isHorizontalSwipe) {
                                    val startedAtDrawerEdge = downX <= edgeInset
                                    val startedAwayFromEdges = downX > edgeInset && downX < width - edgeInset
                                    if (startedAtDrawerEdge && deltaX > 0) {
                                        onOpenDrawer()
                                    } else if (startedAwayFromEdges) {
                                        onHorizontalSwipe(
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
                        override fun onPageFinished(view: WebView, url: String?) {
                            container.isRefreshing = false
                        }

                        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                            val target = request.url
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

                    loadUrl(url)
                }

                hostedWebView = webView
                addView(webView, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
                setOnChildScrollUpCallback { _, _ -> webView.canScrollVertically(-1) }
                setOnRefreshListener { webView.reload() }
                bridge.attach(webView)
                onWebViewReady(webView)
            }
        },
        update = { it.hostedWebView?.let(onWebViewReady) }
    )
}

private class NekoRefreshLayout(context: Context) : SwipeRefreshLayout(context) {
    var hostedWebView: WebView? = null
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

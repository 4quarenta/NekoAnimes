package com.nekoanimes.app.web

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
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

@Composable
fun WebViewHost(
    url: String,
    bridge: NekoBridge,
    modifier: Modifier = Modifier,
    onWebViewReady: (WebView) -> Unit
) {
    AndroidView(
        modifier = modifier,
        factory = { context ->
            SwipeRefreshLayout(context).apply {
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

                addView(webView, SwipeRefreshLayout.LayoutParams(-1, -1))
                setOnRefreshListener { webView.reload() }
                bridge.attach(webView)
                onWebViewReady(webView)
            }
        },
        update = { onWebViewReady(it.getChildAt(0) as WebView) }
    )
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

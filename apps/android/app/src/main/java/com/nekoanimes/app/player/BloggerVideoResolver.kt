package com.nekoanimes.app.player

import android.app.Activity
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Blogger video.g exposes the playable googlevideo URL only after its own
 * player starts. Resolve it on-device so the short-lived URL is immediately
 * handed to ExoPlayer and is never persisted by the app or API.
 */
internal class BloggerVideoResolver(private val activity: Activity) {
    suspend fun resolve(sourceUrl: String): String = suspendCancellableCoroutine { continuation ->
        val mainHandler = Handler(Looper.getMainLooper())
        var webView: WebView? = null
        var host: FrameLayout? = null
        var completed = false

        fun finish(result: Result<String>) {
            if (completed) return
            completed = true
            mainHandler.removeCallbacksAndMessages(null)
            webView?.stopLoading()
            host?.removeView(webView)
            (host?.parent as? ViewGroup)?.removeView(host)
            webView?.destroy()
            webView = null
            host = null
            if (!continuation.isActive) return
            result.getOrNull()?.let(continuation::resume)
                ?: continuation.resumeWithException(result.exceptionOrNull() ?: IllegalStateException("Falha ao resolver Blogger"))
        }

        mainHandler.post {
            if (!continuation.isActive) return@post
            val playerWebView = WebView(activity)
            webView = playerWebView
            val playerHost = FrameLayout(activity).apply {
                alpha = 0f
                visibility = View.VISIBLE
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO
            }
            host = playerHost
            activity.addContentView(
                playerHost,
                ViewGroup.LayoutParams(1, 1)
            )
            playerHost.addView(playerWebView, FrameLayout.LayoutParams(1, 1))
            playerWebView.settings.javaScriptEnabled = true
            playerWebView.settings.domStorageEnabled = true
            playerWebView.settings.cacheMode = android.webkit.WebSettings.LOAD_NO_CACHE
            playerWebView.settings.mediaPlaybackRequiresUserGesture = false
            playerWebView.settings.allowFileAccess = false
            playerWebView.settings.allowContentAccess = false
            playerWebView.settings.setSupportMultipleWindows(false)
            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(playerWebView, true)

            fun triggerPlayback(view: WebView) {
                view.evaluateJavascript(
                    """
                    (() => {
                      const main = document.querySelector('main');
                      if (!main) return 'missing-main';
                      main.click();
                      main.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                      return 'clicked';
                    })();
                    """.trimIndent(),
                    null
                )
            }

            playerWebView.webViewClient = object : WebViewClient() {
                override fun onLoadResource(view: WebView, url: String?) {
                    findPlayableUrl(url)?.let { finish(Result.success(it)) }
                }

                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): android.webkit.WebResourceResponse? {
                    findPlayableUrl(request.url.toString())?.let { mainHandler.post { finish(Result.success(it)) } }
                    return null
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    // The public Blogger player starts the embedded player on
                    // this click, after which shouldInterceptRequest observes
                    // the signed googlevideo URL.
                    triggerPlayback(view)
                    mainHandler.postDelayed({
                        if (!completed && continuation.isActive) triggerPlayback(view)
                    }, 750L)
                    mainHandler.postDelayed({
                        if (!completed && continuation.isActive) triggerPlayback(view)
                    }, 2_000L)
                }
            }
            playerWebView.loadUrl(sourceUrl)
            mainHandler.postDelayed(
                { finish(Result.failure(IllegalStateException("Blogger não retornou um MP4 temporário"))) },
                TIMEOUT_MS
            )
        }

        continuation.invokeOnCancellation {
            mainHandler.post { finish(Result.failure(IllegalStateException("Resolução Blogger cancelada"))) }
        }
    }

    private fun findPlayableUrl(value: String?): String? {
        if (value.isNullOrBlank()) return null
        val uri = Uri.parse(value)
        val host = uri.host?.lowercase() ?: return null
        val mime = uri.getQueryParameter("mime")?.lowercase()
        if (uri.scheme?.lowercase() != "https" || uri.path != "/videoplayback") return null
        if (host != "googlevideo.com" && !host.endsWith(".googlevideo.com")) return null
        if (mime != "video/mp4") return null
        return value
    }

    private companion object {
        const val TIMEOUT_MS = 30_000L
    }
}

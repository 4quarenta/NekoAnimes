package com.nekoanimes.app.bridge

import android.net.Uri
import android.util.Log
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.nekoanimes.app.BuildConfig
import org.json.JSONObject

class NekoBridge(
    private val onRouteChanged: (String) -> Unit,
    private val onOpenPlayer: (String) -> Unit,
    private val onAdEvent: (String, String?) -> Unit
) {
    companion object {
        private const val TAG = "NekoBridge"
        private const val BRIDGE_NAME = "NekoNativeBridge"
    }

    fun attach(webView: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Log.w(TAG, "WEB_MESSAGE_LISTENER indisponível neste WebView")
            return
        }

        WebViewCompat.addWebMessageListener(
            webView,
            BRIDGE_NAME,
            setOf(BuildConfig.WEB_APP_ORIGIN),
            object : WebViewCompat.WebMessageListener {
                override fun onPostMessage(
                    view: WebView,
                    message: WebMessageCompat,
                    sourceOrigin: Uri,
                    isMainFrame: Boolean,
                    replyProxy: JavaScriptReplyProxy
                ) {
                    if (!isMainFrame) return
                    val raw = message.data ?: return
                    handle(raw)
                }
            }
        )
    }

    fun sendNavigation(webView: WebView, route: String) {
        send(
            webView,
            JSONObject()
                .put("type", "navigation.navigate")
                .put("payload", JSONObject().put("route", route))
                .toString()
        )
    }

    private fun send(webView: WebView, message: String) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE)) return

        WebViewCompat.postWebMessage(
            webView,
            WebMessageCompat(message),
            Uri.parse(BuildConfig.WEB_APP_ORIGIN)
        )
    }

    private fun handle(raw: String) {
        runCatching {
            val envelope = JSONObject(raw)
            when (val type = envelope.getString("type")) {
                "navigation.routeChanged" -> {
                    val route = envelope.optJSONObject("payload")?.optString("route")
                    if (!route.isNullOrBlank() && route.startsWith("/")) onRouteChanged(route)
                }
                "player.open" -> {
                    val episodeId = envelope.optJSONObject("payload")?.optString("episodeId")
                    if (!episodeId.isNullOrBlank()) onOpenPlayer(episodeId)
                }
                "ads.event" -> {
                    val payload = envelope.optJSONObject("payload")
                    val event = payload?.optString("event")
                    if (!event.isNullOrBlank()) {
                        onAdEvent(event, payload.optString("placement").ifBlank { null })
                    }
                }
                else -> Log.d(TAG, "Mensagem ignorada: $type")
            }
        }.onFailure {
            Log.w(TAG, "Mensagem inválida recebida da SPA", it)
        }
    }
}

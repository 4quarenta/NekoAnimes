package com.nekoanimes.app.bridge

import android.net.Uri
import android.util.Log
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.nekoanimes.app.BuildConfig
import org.json.JSONArray
import org.json.JSONObject

class NekoBridge(
    private val onRouteChanged: (String) -> Unit,
    private val onOpenPlayer: (String) -> Unit,
    private val onAppEvent: (String, String?) -> Unit
) {
    companion object {
        private const val TAG = "NekoBridge"
        private const val BRIDGE_NAME = "NekoNativeBridge"
        private const val VERSION = 1
        private const val MAX_MESSAGE_BYTES = 32 * 1024
        private val CAPABILITIES = listOf("navigation", "player.open", "player.progress", "app.event")
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
                override fun onPostMessage(view: WebView, message: WebMessageCompat, sourceOrigin: Uri, isMainFrame: Boolean, replyProxy: JavaScriptReplyProxy) {
                    if (!isMainFrame || sourceOrigin.toString().trimEnd('/') != BuildConfig.WEB_APP_ORIGIN.trimEnd('/')) return
                    val raw = message.data ?: return
                    if (raw.toByteArray(Charsets.UTF_8).size > MAX_MESSAGE_BYTES) { Log.w(TAG, "Mensagem da bridge excedeu o limite"); return }
                    handle(raw, replyProxy)
                }
            }
        )
    }

    fun sendNavigation(webView: WebView, route: String) {
        if (!isSafeRoute(route)) return
        sendEvent(webView, "navigation.navigate", JSONObject().put("route", route))
    }

    fun sendPlayerClosed(webView: WebView, episodeId: String? = null, positionSeconds: Int = 0, durationSeconds: Int = 0) {
        val payload = JSONObject()
        if (!episodeId.isNullOrBlank()) payload.put("episodeId", episodeId)
        payload.put("positionSeconds", positionSeconds.coerceAtLeast(0))
        payload.put("durationSeconds", durationSeconds.coerceAtLeast(0))
        sendEvent(webView, "player.closed", payload)
    }

    private fun sendReady(webView: WebView) {
        sendEvent(webView, "bridge.ready", JSONObject().put("platform", "android").put("bridgeVersion", VERSION).put("capabilities", JSONArray(CAPABILITIES)))
    }

    private fun sendEvent(webView: WebView, type: String, payload: JSONObject) {
        send(webView, JSONObject().put("version", VERSION).put("type", type).put("payload", payload).toString())
    }

    private fun send(webView: WebView, message: String) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.POST_WEB_MESSAGE)) return
        WebViewCompat.postWebMessage(webView, WebMessageCompat(message), Uri.parse(BuildConfig.WEB_APP_ORIGIN))
    }

    private fun handle(raw: String, replyProxy: JavaScriptReplyProxy) {
        runCatching {
            val envelope = JSONObject(raw)
            val id = envelope.optString("id")
            val version = envelope.optInt("version", -1)
            val type = envelope.optString("type")
            val payload = envelope.optJSONObject("payload") ?: JSONObject()
            if (id.isBlank() || type.isBlank()) return@runCatching
            if (version != VERSION) { replyError(replyProxy, id, "UNSUPPORTED_VERSION", "Versão da bridge não suportada"); return@runCatching }
            when (type) {
                "bridge.handshake" -> replyOk(replyProxy, id, JSONObject().put("bridgeVersion", VERSION))
                "navigation.routeChanged" -> {
                    val route = payload.optString("route")
                    if (!isSafeRoute(route)) replyError(replyProxy, id, "INVALID_ROUTE", "Rota inválida") else { onRouteChanged(route); replyOk(replyProxy, id) }
                }
                "player.open" -> {
                    val episodeId = payload.optString("episodeId")
                    if (!isSafeId(episodeId)) replyError(replyProxy, id, "INVALID_EPISODE", "episodeId inválido") else { onOpenPlayer(episodeId); replyOk(replyProxy, id) }
                }
                "app.event" -> {
                    val name = payload.optString("name")
                    val placement = payload.optString("placement").ifBlank { null }
                    if (!isSafeId(name)) replyError(replyProxy, id, "INVALID_EVENT", "Evento inválido") else { onAppEvent(name, placement); replyOk(replyProxy, id) }
                }
                else -> replyError(replyProxy, id, "UNKNOWN_METHOD", "Método não suportado")
            }
        }.onFailure { Log.w(TAG, "Mensagem inválida recebida da SPA", it) }
    }

    private fun replyOk(replyProxy: JavaScriptReplyProxy, id: String, payload: JSONObject? = null) {
        val response = JSONObject().put("version", VERSION).put("id", id).put("type", "bridge.response").put("ok", true)
        if (payload != null) response.put("payload", payload)
        replyProxy.postMessage(response.toString())
    }

    private fun replyError(replyProxy: JavaScriptReplyProxy, id: String, code: String, message: String) {
        replyProxy.postMessage(JSONObject().put("version", VERSION).put("id", id).put("type", "bridge.response").put("ok", false).put("error", JSONObject().put("code", code).put("message", message)).toString())
    }

    private fun isSafeRoute(route: String): Boolean = route.startsWith("/") && route.length <= 512
    private fun isSafeId(value: String): Boolean = value.isNotBlank() && value.length <= 128
}

package com.nekoanimes.app.web

/** The host supplies only same-origin main-document URLs, including SPA history updates. */
internal class DocumentRecovery(initialUrl: String) {
    var lastUrl = initialUrl
        private set
    var failedUrl: String? = null
        private set
    var loading = false
        private set
    var hasStarted = false
        private set

    fun started(url: String) {
        lastUrl = url
        failedUrl = null
        loading = true
        hasStarted = true
    }

    fun visited(url: String) {
        if (failedUrl == null) lastUrl = url
    }

    fun failed(url: String) {
        // Ignore a late failure from a document superseded by another navigation.
        if (url != lastUrl) return
        failedUrl = url
        loading = false
    }

    fun finished(url: String) {
        if (url == lastUrl) loading = false
        // onPageFinished also fires for Chromium's error document; never clear failure here.
    }

    fun interrupted() {
        if (loading) failed(lastUrl)
    }

    fun recoveryUrl(): String? = failedUrl ?: if (!hasStarted) lastUrl else null
}

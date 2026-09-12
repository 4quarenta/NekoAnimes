package com.nekoanimes.app.bridge

data class PlayerSourceOverride(
    val url: String,
    val mimeType: String?,
    val label: String?,
    val headers: Map<String, String>
)

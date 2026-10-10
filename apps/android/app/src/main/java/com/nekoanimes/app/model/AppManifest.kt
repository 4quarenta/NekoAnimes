package com.nekoanimes.app.model

data class AppManifest(
    val schemaVersion: Int,
    val configVersion: Int,
    val mode: Int,
    val webAppUrl: String,
    val navigation: List<NavigationItem>
)

data class NavigationItem(
    val id: String,
    val label: String,
    val icon: String,
    val route: String
)

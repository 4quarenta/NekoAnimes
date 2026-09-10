package com.nekoanimes.app.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import com.nekoanimes.app.model.NavigationItem

@Composable
fun NekoNavigationBar(
    items: List<NavigationItem>,
    selectedRoute: String,
    onSelected: (NavigationItem) -> Unit
) {
    NavigationBar {
        items.forEach { item ->
            NavigationBarItem(
                selected = isSelected(selectedRoute, item.route),
                onClick = { onSelected(item) },
                icon = { Icon(imageVector = iconFor(item.icon), contentDescription = item.label) },
                label = { Text(item.label) },
                alwaysShowLabel = true
            )
        }
    }
}

private fun isSelected(current: String, target: String): Boolean {
    if (target == "/") return current == "/"
    return current.startsWith(target)
}

private fun iconFor(icon: String) = when (icon) {
    "home" -> Icons.Default.Home
    "search" -> Icons.Default.Search
    "library" -> Icons.Default.Favorite
    "bookmark" -> Icons.Default.Bookmark
    else -> Icons.Default.List
}

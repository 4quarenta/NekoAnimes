package com.nekoanimes.app.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Bookmark
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.List
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.DrawerState
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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

@Composable
fun NekoNavigationDrawer(
    drawerState: DrawerState,
    items: List<NavigationItem>,
    selectedRoute: String,
    onSelected: (NavigationItem) -> Unit,
    content: @Composable () -> Unit
) {
    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = true,
        drawerContent = {
            ModalDrawerSheet {
                Text("NekoAnimes", modifier = Modifier.padding(horizontal = 28.dp, vertical = 24.dp))
                items.forEach { item ->
                    NavigationDrawerItem(
                        selected = isSelected(selectedRoute, item.route),
                        onClick = { onSelected(item) },
                        icon = { Icon(imageVector = iconFor(item.icon), contentDescription = null) },
                        label = { Text(drawerLabel(item)) },
                        modifier = Modifier.padding(horizontal = 12.dp)
                    )
                }
            }
        },
        content = content
    )
}

private fun isSelected(current: String, target: String): Boolean {
    if (target == "/") return current == "/"
    return current.startsWith(target)
}

private fun iconFor(icon: String) = when (icon) {
    "home" -> Icons.Default.Home
    "catalog" -> Icons.Default.List
    "search" -> Icons.Default.Search
    "library" -> Icons.Default.Favorite
    "bookmark" -> Icons.Default.Bookmark
    "account", "profile" -> Icons.Default.AccountCircle
    else -> Icons.Default.List
}

private fun drawerLabel(item: NavigationItem): String = when (item.route) {
    "/lista", "/salvos" -> "Favoritos"
    else -> item.label
}

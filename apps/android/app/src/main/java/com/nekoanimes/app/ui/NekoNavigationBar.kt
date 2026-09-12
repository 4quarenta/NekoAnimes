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
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.awaitEachGesture
import androidx.compose.ui.input.pointer.awaitFirstDown
import androidx.compose.ui.input.pointer.consume
import androidx.compose.ui.input.pointer.positionChangeIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import com.nekoanimes.app.model.NavigationItem
import kotlinx.coroutines.launch
import kotlin.math.abs

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
    val drawerScope = rememberCoroutineScope()
    val closeThresholdPx = with(LocalDensity.current) { 72.dp.toPx() }
    val touchSlopPx = with(LocalDensity.current) { 8.dp.toPx() }

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = false,
        drawerContent = {
            ModalDrawerSheet(
                modifier = Modifier
                    .fillMaxWidth(0.7f)
                    .pointerInput(drawerState, closeThresholdPx, touchSlopPx) {
                        awaitEachGesture {
                            awaitPointerEventScope {
                                val down = awaitFirstDown(
                                    requireUnconsumed = false,
                                    pass = PointerEventPass.Initial
                                )
                                var totalDrag = Offset.Zero
                                var tracking = true
                                while (tracking) {
                                    val event = awaitPointerEvent(PointerEventPass.Initial)
                                    val change = event.changes.firstOrNull { it.id == down.id } ?: break
                                    if (!change.pressed) {
                                        tracking = false
                                        break
                                    }
                                    val delta = change.positionChangeIgnoreConsumed()
                                    totalDrag += delta
                                    if (abs(totalDrag.x) > touchSlopPx && abs(totalDrag.x) > abs(totalDrag.y)) {
                                        change.consume()
                                    }
                                }
                                if (totalDrag.x <= -closeThresholdPx) {
                                    drawerScope.launch { drawerState.close() }
                                }
                            }
                        }
                    }
            ) {
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

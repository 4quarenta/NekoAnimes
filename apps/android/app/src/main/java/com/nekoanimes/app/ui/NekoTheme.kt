package com.nekoanimes.app.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val NekoColors = darkColorScheme(
    primary = Color(0xFF8B5CF6),
    background = Color(0xFF0D0D11),
    surface = Color(0xFF16161D),
    surfaceContainer = Color(0xFF16161D),
    onBackground = Color(0xFFF4F4F5),
    onSurface = Color(0xFFF4F4F5)
)

@Composable
fun NekoTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = NekoColors, content = content)
}

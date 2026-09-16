package com.nekoanimes.app.update

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import com.nekoanimes.app.BuildConfig
import androidx.activity.ComponentActivity
import android.content.Intent
import android.net.Uri
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
internal fun NekoUpdatePrompt(activity: ComponentActivity) {
    if (!BuildConfig.SELF_UPDATE_ENABLED) return

    val repository = remember { UpdateRepository(activity.cacheDir) }
    val installer = remember { ApkInstaller(activity.applicationContext) }
    val scope = rememberCoroutineScope()
    var update by remember { mutableStateOf<UpdateDescriptor?>(null) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var resumeKey by remember { mutableIntStateOf(0) }
    var waitingForInstallPermission by remember { mutableStateOf(false) }

    DisposableEffect(activity) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) resumeKey += 1
        }
        activity.lifecycle.addObserver(observer)
        onDispose { activity.lifecycle.removeObserver(observer) }
    }

    LaunchedEffect(Unit) {
        update = runCatching { withContext(Dispatchers.IO) { repository.check() } }.getOrNull()
    }

    val descriptor = update ?: return

    LaunchedEffect(resumeKey, waitingForInstallPermission) {
        if (resumeKey == 0 || !waitingForInstallPermission || !installer.canInstallPackages() || busy) return@LaunchedEffect
        waitingForInstallPermission = false
        error = null
        busy = true
        runCatching { withContext(Dispatchers.IO) { repository.download(descriptor) } }
            .onSuccess { installer.install(it) }
            .onFailure { error = it.message ?: "Não foi possível baixar a atualização." }
        busy = false
    }

    AlertDialog(
        onDismissRequest = { if (!descriptor.required && !busy) update = null },
        title = { Text("Nova versão disponível") },
        text = {
            Text(
                buildString {
                    append("NekoAnimes ${descriptor.versionName} está disponível.")
                    if (descriptor.required) append(" Esta atualização é obrigatória.")
                    error?.let { append("\n\n$it") }
                }
            )
        },
        confirmButton = {
            Button(
                enabled = !busy,
                onClick = {
                    error = null
                    if (descriptor.updateMode == "play_store") {
                        activity.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(descriptor.storeUrl)))
                        return@Button
                    }
                    if (!installer.canInstallPackages()) {
                        waitingForInstallPermission = true
                        installer.openInstallPermissionSettings()
                        error = "Autorize a instalação de apps por esta fonte. O download continuará automaticamente ao voltar."
                        return@Button
                    }
                    busy = true
                    scope.launch {
                        runCatching { withContext(Dispatchers.IO) { repository.download(descriptor) } }
                            .onSuccess { installer.install(it) }
                            .onFailure { error = it.message ?: "Não foi possível baixar a atualização." }
                        busy = false
                    }
                }
            ) { Text(if (busy) "Baixando..." else "Atualizar") }
        },
        dismissButton = {
            if (!descriptor.required) {
                TextButton(enabled = !busy, onClick = { update = null }) { Text("Depois") }
            }
        }
    )
}

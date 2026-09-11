package com.nekoanimes.app.update

import com.nekoanimes.app.BuildConfig
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

internal data class UpdateDescriptor(
    val versionCode: Int,
    val versionName: String,
    val apkUrl: String,
    val sha256: String,
    val required: Boolean
)

internal class UpdateRepository(private val cacheDir: File) {
    fun check(): UpdateDescriptor? {
        if (!BuildConfig.SELF_UPDATE_ENABLED) return null
        val connection = URL("${BuildConfig.API_BASE_URL}/v1/app-update/android").openConnection() as HttpURLConnection
        connection.connectTimeout = 5_000
        connection.readTimeout = 8_000
        connection.requestMethod = "GET"
        connection.setRequestProperty("Accept", "application/json")
        try {
            if (connection.responseCode !in 200..299) return null
            val raw = connection.inputStream.bufferedReader().use { it.readText() }
            val root = JSONObject(raw)
            val descriptor = UpdateDescriptor(
                versionCode = root.getInt("versionCode"),
                versionName = root.getString("versionName"),
                apkUrl = root.getString("apkUrl"),
                sha256 = root.getString("sha256").lowercase(),
                required = root.optBoolean("required", false)
            )
            if (descriptor.versionCode <= BuildConfig.VERSION_CODE) return null
            if (!BuildConfig.DEBUG && !descriptor.apkUrl.startsWith("https://")) return null
            if (!descriptor.sha256.matches(Regex("^[a-f0-9]{64}$"))) return null
            return descriptor
        } finally {
            connection.disconnect()
        }
    }

    fun download(descriptor: UpdateDescriptor): File {
        val directory = File(cacheDir, "updates").apply { mkdirs() }
        val target = File(directory, "NekoAnimes-${descriptor.versionName}.apk")
        val connection = URL(descriptor.apkUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = 10_000
        connection.readTimeout = 30_000
        connection.instanceFollowRedirects = true
        connection.setRequestProperty("Accept", "application/vnd.android.package-archive")
        try {
            if (connection.responseCode !in 200..299) error("Download indisponível (${connection.responseCode})")
            val declaredLength = connection.contentLengthLong
            if (declaredLength > MAX_APK_BYTES) error("APK excede o limite de segurança")
            var written = 0L
            connection.inputStream.use { input ->
                target.outputStream().use { output ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        written += read
                        if (written > MAX_APK_BYTES) error("APK excede o limite de segurança")
                        output.write(buffer, 0, read)
                    }
                }
            }
            val actual = sha256(target)
            if (actual != descriptor.sha256) {
                target.delete()
                error("Falha na verificação de integridade do APK")
            }
            return target
        } catch (error: Throwable) {
            target.delete()
            throw error
        } finally {
            connection.disconnect()
        }
    }

    private fun sha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(32 * 1024)
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val MAX_APK_BYTES = 250L * 1024L * 1024L
    }
}

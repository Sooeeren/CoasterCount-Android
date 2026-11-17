package app.coastercount.apkinstaller

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Own subclass so the provider never clashes with another FileProvider in the merged manifest. */
class UpdateFileProvider : FileProvider()

@InvokeArg
class InstallArgs {
    lateinit var url: String
}

@TauriPlugin
class ApkInstallerPlugin(private val activity: Activity) : Plugin(activity) {

    @Command
    fun install(invoke: Invoke) {
        val args = invoke.parseArgs(InstallArgs::class.java)

        // Installing needs Android's per-app "Install unknown apps" permission.
        // Without it, open that setting and let the user retry.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            !activity.packageManager.canRequestPackageInstalls()
        ) {
            activity.runOnUiThread {
                activity.startActivity(
                    Intent(
                        Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        Uri.parse("package:" + activity.packageName)
                    )
                )
            }
            invoke.resolve(JSObject().put("status", "needs-permission"))
            return
        }

        // Network + disk work off the main thread.
        Thread {
            try {
                val apk = download(args.url)
                val uri = FileProvider.getUriForFile(
                    activity,
                    activity.packageName + ".apkinstaller.files",
                    apk
                )
                val intent = Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.runOnUiThread { activity.startActivity(intent) }
                invoke.resolve(JSObject().put("status", "installing"))
            } catch (ex: Exception) {
                invoke.reject(ex.message ?: "Download failed")
            }
        }.start()
    }

    private fun download(url: String): File {
        val dir = File(activity.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // only ever keep one update
        val target = File(dir, "update.apk")

        // GitHub release downloads redirect to a CDN host; follow HTTPS
        // redirects only, at most a few hops.
        var connection = URL(url).openConnection() as HttpURLConnection
        var redirects = 0
        while (true) {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            val code = connection.responseCode
            if (code in 300..399 && redirects < 5) {
                val next = connection.getHeaderField("Location") ?: throw IOException("Redirect without location")
                if (!next.startsWith("https://")) throw IOException("Refusing non-HTTPS redirect")
                connection.disconnect()
                connection = URL(next).openConnection() as HttpURLConnection
                redirects++
                continue
            }
            if (code !in 200..299) throw IOException("Download failed (HTTP $code)")
            break
        }
        connection.inputStream.use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
        }
        connection.disconnect()
        return target
    }
}

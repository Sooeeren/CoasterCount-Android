package app.coastercount.wrapper

import android.content.res.Configuration
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  private var networkCallback: ConnectivityManager.NetworkCallback? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    watchNetwork()
  }

  // Android's WebView doesn't track connectivity on its own: navigator.onLine
  // stays true and the page never gets "offline"/"online" events unless the
  // app reports changes. inject/core.js (offline banner) and
  // features/90-offline-links.js rely on those events.
  private fun watchNetwork() {
    val cm = getSystemService(ConnectivityManager::class.java) ?: return
    fun report(available: Boolean) = runOnUiThread { webView?.setNetworkAvailable(available) }
    fun current(): Boolean {
      val caps = cm.activeNetwork?.let { cm.getNetworkCapabilities(it) } ?: return false
      return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
    val callback = object : ConnectivityManager.NetworkCallback() {
      override fun onAvailable(network: Network) = report(true)
      // Default network gone; if another takes over, onAvailable follows.
      // (Asking for activeNetwork here can still return the lost one.)
      override fun onLost(network: Network) = report(false)
      override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) =
        report(caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET))
    }
    try {
      cm.registerDefaultNetworkCallback(callback)
      networkCallback = callback
    } catch (e: Exception) {
      // Missing ACCESS_NETWORK_STATE or a platform quirk: keep WebView's default.
    }
    report(current())
  }

  // The manifest handles uiMode itself (no activity restart), so switching
  // dark mode while the app is open wouldn't update the status/navigation bar
  // icons. Re-apply edge-to-edge: it picks light or dark icons for the new
  // mode.
  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    enableEdgeToEdge()
  }

  // WebView writes cookies to disk only every so often. Flush when the app
  // leaves the foreground so the site's login cookie survives Android
  // killing the app in the background.
  override fun onPause() {
    CookieManager.getInstance().flush()
    super.onPause()
  }

  override fun onDestroy() {
    networkCallback?.let {
      try { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(it) } catch (e: Exception) {}
    }
    networkCallback = null
    webView = null
    super.onDestroy()
  }
}

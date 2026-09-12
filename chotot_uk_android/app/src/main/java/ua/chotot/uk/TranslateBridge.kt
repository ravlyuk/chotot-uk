package ua.chotot.uk

import android.content.SharedPreferences
import android.webkit.JavascriptInterface
import android.webkit.WebView
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.lang.ref.WeakReference

class TranslateBridge(
    webView: WebView,
    private val translatorProvider: () -> BatchTranslator,
    private val prefs: SharedPreferences,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var webViewRef = WeakReference(webView)
    @Volatile
    var nestedCanScrollUp: Boolean = false
        private set
    @Volatile
    var isChatSurface: Boolean = false
        private set
    var onSurfaceHintsChanged: (() -> Unit)? = null

    fun attach(webView: WebView) {
        webViewRef = WeakReference(webView)
        resetSurfaceHints()
    }

    fun resetSurfaceHints() {
        nestedCanScrollUp = false
        isChatSurface = false
        notifySurfaceHintsChanged()
    }

    private fun notifySurfaceHintsChanged() {
        val view = webViewRef.get() ?: return
        view.post { onSurfaceHintsChanged?.invoke() }
    }

    @JavascriptInterface
    fun isOnlineEnabled(): Boolean = prefs.getBoolean(PREF_ONLINE, false)

    @JavascriptInterface
    fun setNestedScrollUp(canScroll: Boolean) {
        nestedCanScrollUp = canScroll
    }

    @JavascriptInterface
    fun setChatSurface(isChat: Boolean) {
        val changed = isChatSurface != isChat
        isChatSurface = isChat
        if (isChat) {
            nestedCanScrollUp = true
        }
        if (changed) {
            notifySurfaceHintsChanged()
        }
    }

    @JavascriptInterface
    fun translateBatch(requestId: String, textsJson: String) {
        if (!isOnlineEnabled()) {
            return
        }
        scope.launch {
            val payload = runCatching {
                val texts = JSONArray(textsJson).let { array ->
                    List(array.length()) { index -> array.getString(index) }
                }
                val translations = translatorProvider().translateBatch(texts)
                JSONObject()
                    .put("ok", true)
                    .put("translations", JSONArray(translations))
                    .toString()
            }.getOrElse {
                JSONObject().put("ok", false).toString()
            }
            val quotedId = JSONObject.quote(requestId)
            val view = webViewRef.get() ?: return@launch
            view.post {
                if (!view.isAttachedToWindow) {
                    return@post
                }
                runCatching {
                    view.evaluateJavascript(
                        "window.CHOTOT_UK && CHOTOT_UK.onTranslateResult($quotedId, $payload)",
                        null,
                    )
                }
            }
        }
    }

    fun setOnlineEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(PREF_ONLINE, enabled).apply()
    }

    fun cancel() {
        scope.cancel()
    }

    companion object {
        const val PREFS = "chotot_uk"
        const val PREF_ONLINE = "online_enabled"
    }
}

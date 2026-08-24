package ua.chotot.uk

import android.content.res.AssetManager
import android.webkit.WebView

class ScriptInjector(private val assets: AssetManager) {
    val bootScript: String by lazy {
        buildString {
            append("if (!window.__chototUkBooted) {\n")
            append(readAsset("translator/dictionary.js"))
            append('\n')
            append(readAsset("translator/translator.js"))
            append('\n')
            append(readAsset("translator/bootstrap.js"))
            append("\n} else if (window.CHOTOT_UK) { CHOTOT_UK.translateDocument(); }\n")
        }
    }

    fun inject(webView: WebView) {
        runCatching {
            webView.evaluateJavascript(REFRESH_SCRIPT, null)
        }
    }

    fun boot(webView: WebView) {
        runCatching {
            webView.evaluateJavascript(bootScript, null)
        }
    }

    private fun readAsset(path: String): String {
        return assets.open(path).bufferedReader().use { it.readText() }
    }

    companion object {
        private const val REFRESH_SCRIPT =
            "window.CHOTOT_UK && CHOTOT_UK.translateDocument();"
    }
}

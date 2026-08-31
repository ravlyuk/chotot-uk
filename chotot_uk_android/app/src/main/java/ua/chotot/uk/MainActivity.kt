package ua.chotot.uk

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.Message
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebView.WebViewTransport
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updatePadding
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import ua.chotot.uk.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var injector: ScriptInjector
    private lateinit var bridge: TranslateBridge
    private lateinit var mainWebView: WebView
    private lateinit var popupWebView: WebView
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private lateinit var chromeUserAgent: String
    private var lastMainUrl: String = HOME_URL
    private var isRecoveringRenderer = false
    private var popupProbe: WebView? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private val hasDocumentStart: Boolean
        get() = WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)

    private val fileChooser = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents(),
    ) { uris ->
        val callback = filePathCallback
        filePathCallback = null
        if (uris.isEmpty()) {
            callback?.onReceiveValue(null)
        } else {
            callback?.onReceiveValue(uris.toTypedArray())
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        applySystemBarInsets()

        chromeUserAgent = buildChromeUserAgent()
        injector = ScriptInjector(assets)
        mainWebView = binding.webView
        popupWebView = binding.popupWebView
        val prefs = getSharedPreferences(TranslateBridge.PREFS, MODE_PRIVATE)
        bridge = TranslateBridge(mainWebView, (application as ChototUkApp).translator, prefs)

        binding.toolbar.inflateMenu(R.menu.main_menu)
        binding.toolbar.menu.findItem(R.id.action_online).isChecked = bridge.isOnlineEnabled()
        binding.toolbar.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                R.id.action_home -> {
                    hideOauthPopup()
                    mainWebView.loadUrl(HOME_URL)
                    true
                }
                R.id.action_online -> {
                    val enabled = !item.isChecked
                    item.isChecked = enabled
                    bridge.setOnlineEnabled(enabled)
                    runCatching {
                        mainWebView.evaluateJavascript(
                            "window.CHOTOT_UK && CHOTOT_UK.setUseOnline($enabled)",
                            null,
                        )
                    }
                    true
                }
                else -> false
            }
        }
        binding.popupToolbar.setNavigationOnClickListener { hideOauthPopup() }
        binding.popupToolbar.navigationContentDescription = getString(R.string.oauth_popup_close)
        setupSwipeRefresh()

        WebView.setWebContentsDebuggingEnabled(true)
        CookieManager.getInstance().setAcceptCookie(true)

        attachMainWebView(mainWebView)
        attachPopupWebView(popupWebView)

        onBackPressedDispatcher.addCallback(
            this,
            object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() {
                    when {
                        isOauthPopupVisible() && popupWebView.canGoBack() -> popupWebView.goBack()
                        isOauthPopupVisible() -> hideOauthPopup()
                        mainWebView.canGoBack() -> mainWebView.goBack()
                        else -> {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                        }
                    }
                }
            },
        )

        mainWebView.loadUrl(HOME_URL)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView(webView: WebView, supportsPopups: Boolean) {
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            javaScriptCanOpenWindowsAutomatically = supportsPopups
            mediaPlaybackRequiresUserGesture = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
            setSupportMultipleWindows(supportsPopups)
            useWideViewPort = true
            loadWithOverviewMode = true
            userAgentString = chromeUserAgent
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.setColorSchemeResources(R.color.brand_blue)
        binding.swipeRefresh.setProgressBackgroundColorSchemeResource(R.color.brand_yellow)
        binding.swipeRefresh.setOnChildScrollUpCallback { _, _ ->
            mainWebView.canScrollVertically(-1)
        }
        binding.swipeRefresh.setOnRefreshListener {
            if (isOauthPopupVisible()) {
                binding.swipeRefresh.isRefreshing = false
                return@setOnRefreshListener
            }
            mainWebView.reload()
        }
    }

    private fun stopRefreshing() {
        binding.swipeRefresh.isRefreshing = false
    }

    private fun attachMainWebView(webView: WebView) {
        configureWebView(webView, supportsPopups = true)
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        installDocumentStartScripts(webView)
        webView.addJavascriptInterface(bridge, "ChototUkNative")
        webView.webViewClient = ChototWebViewClient(injectTranslator = true)
        webView.webChromeClient = ChototChromeClient()
        bridge.attach(webView)
    }

    private fun attachPopupWebView(webView: WebView) {
        configureWebView(webView, supportsPopups = false)
        spoofChromeEnvironment(webView)
        webView.webViewClient = ChototWebViewClient(injectTranslator = false)
        webView.webChromeClient = PopupChromeClient()
    }

    private fun recoverAfterRendererCrash() {
        val restoreUrl = lastMainUrl.ifBlank { HOME_URL }
        binding.popupContainer.visibility = View.GONE
        binding.swipeRefresh.isEnabled = true
        destroyPopupProbe()
        replaceMainWebView()
        replacePopupWebView()
        mainWebView.loadUrl(restoreUrl)
    }

    private fun replaceMainWebView() {
        val container = binding.swipeRefresh
        val old = mainWebView
        runCatching { old.removeJavascriptInterface("ChototUkNative") }
        container.removeView(old)
        runCatching { old.destroy() }
        val next = WebView(this)
        next.layoutParams = ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
        )
        container.addView(next)
        mainWebView = next
        attachMainWebView(mainWebView)
    }

    private fun replacePopupWebView() {
        val container = binding.popupContainer
        val old = popupWebView
        container.removeView(old)
        runCatching { old.destroy() }
        val next = WebView(this)
        next.layoutParams = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            0,
            1f,
        )
        container.addView(next)
        popupWebView = next
        attachPopupWebView(popupWebView)
    }

    private fun buildChromeUserAgent(): String {
        val defaultUa = WebSettings.getDefaultUserAgent(this)
        val chromeVersion = CHROME_VERSION_RE.find(defaultUa)?.groupValues?.get(1) ?: "120.0.0.0"
        val androidVersion = ANDROID_VERSION_RE.find(defaultUa)?.groupValues?.get(1) ?: "14"
        return "Mozilla/5.0 (Linux; Android $androidVersion; K) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/$chromeVersion Mobile Safari/537.36"
    }

    private fun installDocumentStartScripts(webView: WebView) {
        spoofChromeEnvironment(webView)
        if (!hasDocumentStart) {
            return
        }
        runCatching {
            WebViewCompat.addDocumentStartJavaScript(webView, injector.bootScript, CHOTOT_ORIGINS)
        }
    }

    private fun spoofChromeEnvironment(webView: WebView) {
        if (!hasDocumentStart) {
            return
        }
        val quotedUa = JSONObject.quote(chromeUserAgent)
        val script = """
            (function () {
              document.cookie = "showTopBanner=false; path=/; max-age=2592000; SameSite=Lax";
              document.cookie = "showTopBanner=false; path=/; domain=.chotot.com; max-age=2592000; SameSite=Lax";
              var ua = $quotedUa;
              try {
                Object.defineProperty(Navigator.prototype, "userAgent", {
                  get: function () { return ua; },
                  configurable: true
                });
              } catch (error) {
                try {
                  Object.defineProperty(navigator, "userAgent", {
                    get: function () { return ua; },
                    configurable: true
                  });
                } catch (ignored) {}
              }
              window.chrome = window.chrome || { runtime: {} };
              if (!document.getElementById("chotot-uk-hide-app-promo")) {
                var style = document.createElement("style");
                style.id = "chotot-uk-hide-app-promo";
                style.textContent = ".showSafetyM,.showSafetyD,[class*='showSafetyM'],[class*='showSafetyD'],a[href^='chotot-app:'],a[href*='web_to_app']{display:none!important;height:0!important;opacity:0!important;pointer-events:none!important}body{--app-wrapper-extra-height:0px!important}";
                (document.documentElement || document.head).appendChild(style);
              }
            })();
        """.trimIndent()
        runCatching {
            WebViewCompat.addDocumentStartJavaScript(webView, script, CHOTOT_ORIGINS)
        }
    }

    private fun applySystemBarInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val isImeVisible = insets.isVisible(WindowInsetsCompat.Type.ime())
            view.updatePadding(
                left = bars.left,
                top = bars.top,
                right = bars.right,
                bottom = maxOf(bars.bottom, ime.bottom),
            )
            if (!isOauthPopupVisible()) {
                binding.swipeRefresh.isEnabled = !isImeVisible
            }
            WindowInsetsCompat.CONSUMED
        }
    }

    private fun isOauthPopupVisible(): Boolean {
        return binding.popupContainer.visibility == View.VISIBLE
    }

    private fun showOauthPopup() {
        binding.swipeRefresh.isEnabled = false
        binding.swipeRefresh.isRefreshing = false
        binding.popupContainer.visibility = View.VISIBLE
    }

    private fun hideOauthPopup() {
        if (!isOauthPopupVisible()) {
            return
        }
        binding.popupContainer.visibility = View.GONE
        binding.swipeRefresh.isEnabled = true
        runCatching { popupWebView.loadUrl("about:blank") }
    }

    private fun handleSpecialUrl(view: WebView, uri: Uri): Boolean {
        val scheme = uri.scheme.orEmpty()
        if (scheme == "tel" || scheme == "mailto" || scheme == "sms") {
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, uri)) }
                .onFailure {
                    Toast.makeText(this, R.string.open_external, Toast.LENGTH_SHORT).show()
                }
            return true
        }
        if (scheme == "chotot-app" || scheme == "chotot") {
            return true
        }
        if (scheme == "intent" || scheme == "market") {
            val fallback = extractIntentFallback(uri)
            if (!fallback.isNullOrBlank()) {
                view.loadUrl(fallback)
            }
            return true
        }
        return false
    }

    private fun extractIntentFallback(uri: Uri): String? {
        val parsed = runCatching {
            Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME)
        }.getOrNull() ?: return uri.getQueryParameter("browser_fallback_url")

        val extraFallback = parsed.getStringExtra("browser_fallback_url")
        if (!extraFallback.isNullOrBlank()) {
            return extraFallback
        }
        if (parsed.data != null && parsed.data?.scheme == "https") {
            return parsed.dataString
        }
        return null
    }

    private fun isChototHost(host: String): Boolean {
        return host == "chotot.com" || host.endsWith(".chotot.com")
    }

    private fun isAllowedPopupHost(host: String): Boolean {
        return isChototHost(host) ||
            host.endsWith(".google.com") ||
            host == "google.com" ||
            host.endsWith(".facebook.com") ||
            host == "facebook.com" ||
            host.endsWith(".apple.com") ||
            host == "apple.com" ||
            host == "appleid.apple.com"
    }

    private fun isOauthPopupHost(host: String): Boolean {
        if (host.startsWith("id.") && isChototHost(host)) {
            return true
        }
        return host == "accounts.google.com" ||
            host.startsWith("accounts.") && host.endsWith(".google.com") ||
            host.contains("oauth") && host.endsWith(".google.com") ||
            host.endsWith(".facebook.com") ||
            host == "facebook.com" ||
            host == "appleid.apple.com"
    }

    private fun destroyPopupProbe() {
        val old = popupProbe ?: return
        popupProbe = null
        runCatching { old.destroy() }
    }

    private fun handlePopupTargetUrl(url: String) {
        val uri = runCatching { Uri.parse(url) }.getOrNull() ?: return
        val host = uri.host.orEmpty()
        when {
            isOauthPopupHost(host) -> {
                showOauthPopup()
                popupWebView.loadUrl(url)
            }
            isChototHost(host) -> {
                if (isOauthPopupVisible()) {
                    hideOauthPopup()
                }
                mainWebView.loadUrl(url)
            }
        }
    }

    private fun createPopupProbe(): WebView {
        destroyPopupProbe()
        val probe = WebView(this)
        probe.settings.javaScriptEnabled = false
        probe.settings.setSupportMultipleWindows(false)
        probe.webViewClient = object : WebViewClient() {
            private var hasConsumedUrl = false

            private fun consumeUrl(url: String?) {
                if (hasConsumedUrl || url.isNullOrBlank() || url == "about:blank") {
                    return
                }
                hasConsumedUrl = true
                handlePopupTargetUrl(url)
            }

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                consumeUrl(request.url.toString())
                return true
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                consumeUrl(url)
            }
        }
        popupProbe = probe
        return probe
    }

    override fun onDestroy() {
        bridge.cancel()
        destroyPopupProbe()
        (popupWebView.parent as? ViewGroup)?.removeView(popupWebView)
        (mainWebView.parent as? ViewGroup)?.removeView(mainWebView)
        runCatching { popupWebView.destroy() }
        runCatching { mainWebView.destroy() }
        super.onDestroy()
    }

    private inner class ChototWebViewClient(
        private val injectTranslator: Boolean,
    ) : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            if (view === popupWebView) {
                val host = uri.host.orEmpty()
                if (isChototHost(host) && !host.startsWith("id.")) {
                    hideOauthPopup()
                    mainWebView.loadUrl(uri.toString())
                    return true
                }
                if (!isAllowedPopupHost(host)) {
                    hideOauthPopup()
                    return true
                }
            }
            return handleSpecialUrl(view, uri)
        }

        override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
            if (view === mainWebView) {
                binding.progress.visibility = View.VISIBLE
                if (!url.isNullOrBlank() && url != "about:blank") {
                    lastMainUrl = url
                }
            }
        }

        override fun onPageCommitVisible(view: WebView, url: String) {
            if (injectTranslator && !hasDocumentStart && isChototHost(Uri.parse(url).host.orEmpty())) {
                injector.boot(view)
            }
        }

        override fun onPageFinished(view: WebView, url: String) {
            if (view === mainWebView) {
                binding.progress.visibility = View.GONE
                stopRefreshing()
            }
            if (!injectTranslator || !isChototHost(Uri.parse(url).host.orEmpty())) {
                return
            }
            if (hasDocumentStart) {
                injector.inject(view)
            } else {
                injector.boot(view)
            }
        }

        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            if (isRecoveringRenderer) {
                return true
            }
            isRecoveringRenderer = true
            mainHandler.post {
                runCatching { recoverAfterRendererCrash() }
                isRecoveringRenderer = false
            }
            return true
        }
    }

    private inner class ChototChromeClient : WebChromeClient() {
        override fun onProgressChanged(view: WebView?, newProgress: Int) {
            binding.progress.progress = newProgress
            binding.progress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            if (view === mainWebView && newProgress >= 100) {
                stopRefreshing()
            }
        }

        override fun onCreateWindow(
            view: WebView?,
            isDialog: Boolean,
            isUserGesture: Boolean,
            resultMsg: Message?,
        ): Boolean {
            if (!isUserGesture) {
                return false
            }
            val message = resultMsg ?: return false
            val transport = message.obj as? WebViewTransport ?: return false
            transport.webView = createPopupProbe()
            message.sendToTarget()
            return true
        }

        override fun onCloseWindow(window: WebView?) {
            hideOauthPopup()
        }

        override fun onShowFileChooser(
            webView: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: FileChooserParams?,
        ): Boolean {
            this@MainActivity.filePathCallback?.onReceiveValue(null)
            this@MainActivity.filePathCallback = filePathCallback
            val mime = fileChooserParams?.acceptTypes
                ?.firstOrNull { candidate ->
                    candidate.isNotBlank() &&
                        candidate.length < 80 &&
                        '/' in candidate &&
                        '\n' !in candidate
                }
                ?: "*/*"
            return runCatching {
                fileChooser.launch(mime)
                true
            }.getOrElse {
                this@MainActivity.filePathCallback = null
                filePathCallback?.onReceiveValue(null)
                false
            }
        }
    }

    private inner class PopupChromeClient : WebChromeClient() {
        override fun onCloseWindow(window: WebView?) {
            hideOauthPopup()
        }
    }

    companion object {
        private const val HOME_URL = "https://www.chotot.com/"
        private val CHROME_VERSION_RE = Regex("Chrome/([\\d.]+)")
        private val ANDROID_VERSION_RE = Regex("Android ([\\d.]+)")
        private val CHOTOT_ORIGINS = setOf(
            "https://*.chotot.com",
            "https://chotot.com",
            "https://*.chotot.vn",
            "https://chotot.vn",
        )
    }
}

package ua.chotot.uk

import android.app.Application

class ChototUkApp : Application() {
    private val translatorLock = Any()
    private var translatorInstance: HybridTranslator? = null

    val translator: HybridTranslator
        get() {
            synchronized(translatorLock) {
                translatorInstance?.let { return it }
                val onDevice = OnDeviceTranslator()
                return HybridTranslator(onDevice, GoogleTranslator()).also { hybrid ->
                    translatorInstance = hybrid
                    onDevice.prepare()
                }
            }
        }
}

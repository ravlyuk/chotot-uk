package ua.chotot.uk

import android.app.Application

class ChototUkApp : Application() {
    lateinit var translator: HybridTranslator
        private set

    override fun onCreate() {
        super.onCreate()
        val onDevice = OnDeviceTranslator()
        translator = HybridTranslator(onDevice, GoogleTranslator())
        onDevice.prepare()
    }
}

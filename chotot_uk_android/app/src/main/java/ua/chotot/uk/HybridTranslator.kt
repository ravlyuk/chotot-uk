package ua.chotot.uk

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

interface BatchTranslator {
    suspend fun translateBatch(texts: List<String>): List<String>
}

class HybridTranslator(
    private val onDevice: OnDeviceTranslator,
    private val online: GoogleTranslator,
) : BatchTranslator {
    override suspend fun translateBatch(texts: List<String>): List<String> {
        if (!onDevice.isReady) {
            return online.translateBatch(texts)
        }
        return coroutineScope {
            texts.map { source ->
                async {
                    val local = runCatching { onDevice.translate(source) }.getOrDefault(source)
                    if (TranslationText.isUsableTranslation(source, local)) {
                        local
                    } else {
                        online.translateOne(source)
                    }
                }
            }.awaitAll()
        }
    }
}

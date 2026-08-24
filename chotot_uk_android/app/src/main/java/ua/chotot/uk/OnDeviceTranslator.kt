package ua.chotot.uk

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.common.model.RemoteModelManager
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.TranslateRemoteModel
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.tasks.await

class OnDeviceTranslator {
    private val translator: Translator = Translation.getClient(
        TranslatorOptions.Builder()
            .setSourceLanguage(TranslateLanguage.VIETNAMESE)
            .setTargetLanguage(TranslateLanguage.UKRAINIAN)
            .build(),
    )
    private val semaphore = Semaphore(MAX_PARALLEL)

    @Volatile
    var isReady: Boolean = false
        private set

    fun prepare() {
        markReadyIfModelsPresent()
        val conditions = DownloadConditions.Builder().build()
        translator.downloadModelIfNeeded(conditions)
            .addOnSuccessListener { isReady = true }
            .addOnFailureListener { isReady = false }
    }

    suspend fun translate(text: String): String {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || !isReady) {
            return text
        }
        if (trimmed.length <= MAX_SOURCE_CHARS) {
            return TranslationText.keepVnd(
                text,
                translateChunk(TranslationText.maskVnd(trimmed)).ifBlank { text },
            )
        }
        val builder = StringBuilder()
        for (chunk in TranslationText.chunkText(text, MAX_SOURCE_CHARS)) {
            val core = chunk.trim()
            if (core.isEmpty()) {
                builder.append(chunk)
                continue
            }
            val translated = TranslationText.keepVnd(
                core,
                translateChunk(TranslationText.maskVnd(core)).ifBlank { core },
            )
            builder.append(chunk.replaceFirst(core, translated))
        }
        return builder.toString()
    }

    private suspend fun translateChunk(text: String): String {
        return semaphore.withPermit {
            runCatching { translator.translate(text).await() }.getOrDefault(text)
        }
    }

    private fun markReadyIfModelsPresent() {
        RemoteModelManager.getInstance()
            .getDownloadedModels(TranslateRemoteModel::class.java)
            .addOnSuccessListener { models ->
                val languages = models.map { model -> model.language }.toSet()
                if (
                    TranslateLanguage.VIETNAMESE in languages &&
                    TranslateLanguage.UKRAINIAN in languages
                ) {
                    isReady = true
                }
            }
    }

    companion object {
        private const val MAX_PARALLEL = 2
        private const val MAX_SOURCE_CHARS = 400
    }
}

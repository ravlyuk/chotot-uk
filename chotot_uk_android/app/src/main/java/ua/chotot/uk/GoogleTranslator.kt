package ua.chotot.uk

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

class GoogleTranslator : BatchTranslator {
    override suspend fun translateBatch(texts: List<String>): List<String> = coroutineScope {
        val semaphore = Semaphore(MAX_PARALLEL)
        texts.map { text ->
            async {
                semaphore.withPermit { translateOne(text) }
            }
        }.awaitAll()
    }

    internal fun translateOne(text: String): String {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) {
            return text
        }
        if (trimmed.length <= MAX_SOURCE_CHARS) {
            return TranslationText.keepVnd(
                text,
                requestTranslate(TranslationText.maskVnd(trimmed)).ifBlank { text },
            )
        }
        return TranslationText.chunkText(text, MAX_SOURCE_CHARS).joinToString("") { chunk ->
            val core = chunk.trim()
            if (core.isEmpty()) {
                chunk
            } else {
                val translated = TranslationText.keepVnd(
                    core,
                    requestTranslate(TranslationText.maskVnd(core)).ifBlank { core },
                )
                chunk.replaceFirst(core, translated)
            }
        }
    }

    private fun requestTranslate(text: String): String {
        val encoded = URLEncoder.encode(text, StandardCharsets.UTF_8.name())
        val url = URL(
            "https://translate.googleapis.com/translate_a/single?client=gtx&sl=vi&tl=uk&dt=t&q=$encoded",
        )
        val connection = (url.openConnection() as HttpURLConnection).apply {
            connectTimeout = TIMEOUT_MS
            readTimeout = TIMEOUT_MS
            requestMethod = "GET"
            setRequestProperty("User-Agent", USER_AGENT)
            setRequestProperty("Accept", "application/json")
        }
        return try {
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val body = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299 || body.isBlank() || !body.startsWith("[")) {
                return text
            }
            parsePayload(body).ifBlank { text }
        } catch (_error: Exception) {
            text
        } finally {
            connection.disconnect()
        }
    }

    private fun parsePayload(body: String): String {
        val sentences = JSONArray(body).optJSONArray(0) ?: return ""
        val builder = StringBuilder()
        for (index in 0 until sentences.length()) {
            val part = sentences.optJSONArray(index) ?: continue
            builder.append(part.optString(0))
        }
        return builder.toString()
    }

    companion object {
        private const val MAX_PARALLEL = 6
        private const val MAX_SOURCE_CHARS = 180
        private const val TIMEOUT_MS = 10_000
        private const val USER_AGENT =
            "Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
    }
}

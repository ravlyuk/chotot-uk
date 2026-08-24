package ua.chotot.uk

object TranslationText {
    val VIETNAMESE_RE =
        Regex(
            "[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]",
            RegexOption.IGNORE_CASE,
        )
    val CYRILLIC_RE = Regex("[А-Яа-яІіЇїЄєҐґ]")

    fun keepVnd(source: String, translated: String): String {
        val result = translated
            .replace(Regex("XXXVNDXXX", RegexOption.IGNORE_CASE), "VND")
            .replace("VNĐ", "VND")
        if (
            Regex("\\b(?:VND|VNĐ)\\b", RegexOption.IGNORE_CASE).containsMatchIn(source) &&
            !Regex("\\bVND\\b").containsMatchIn(result)
        ) {
            return result.replace(
                Regex("\\b(?:вн\\.?\\s*д\\.?|донги?|донгів)\\b", RegexOption.IGNORE_CASE),
                "VND",
            )
        }
        return result
    }

    fun maskVnd(text: String): String {
        return text.replace("VNĐ", "VND").replace(Regex("\\bVND\\b", RegexOption.IGNORE_CASE), "XXXVNDXXX")
    }

    fun stillLooksVietnamese(text: String): Boolean {
        return VIETNAMESE_RE.containsMatchIn(text)
    }

    fun isUsableTranslation(source: String, translated: String): Boolean {
        if (translated.isBlank() || translated == source) {
            return false
        }
        return CYRILLIC_RE.containsMatchIn(translated) || !stillLooksVietnamese(translated)
    }

    fun chunkText(text: String, maxChars: Int): List<String> {
        if (text.length <= maxChars) {
            return listOf(text)
        }
        val chunks = mutableListOf<String>()
        val buffer = StringBuilder()
        val pieces = text.split(Regex("(?<=[\\n.!?])"))
        for (piece in pieces) {
            if (piece.length > maxChars) {
                if (buffer.isNotEmpty()) {
                    chunks.add(buffer.toString())
                    buffer.clear()
                }
                chunks.addAll(splitHard(piece, maxChars))
                continue
            }
            if (buffer.length + piece.length > maxChars && buffer.isNotEmpty()) {
                chunks.add(buffer.toString())
                buffer.clear()
            }
            buffer.append(piece)
        }
        if (buffer.isNotEmpty()) {
            chunks.add(buffer.toString())
        }
        return chunks
    }

    private fun splitHard(text: String, maxChars: Int): List<String> {
        val chunks = mutableListOf<String>()
        var start = 0
        while (start < text.length) {
            val end = (start + maxChars).coerceAtMost(text.length)
            chunks.add(text.substring(start, end))
            start = end
        }
        return chunks
    }
}

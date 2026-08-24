# Chợ Tốt UA — Android

Обгортка над [www.chotot.com](https://www.chotot.com/): WebView відкриває сайт і впорскує той самий словник + перекладач, що й Chrome-розширення. Описи оголошень ідуть через нативний запит до Google Translate (без CORS).

## Як зібрати APK

1. Встановіть [Android Studio](https://developer.android.com/studio)
2. **File → Open** → теку `chotot_uk_android`
3. Дочекайтесь синхронізації Gradle (підвантажить SDK, якщо треба)
4. Підключіть телефон з **USB debugging** або запустіть емулятор
5. **Run ▶** або **Build → Build Bundle(s) / APK(s) → Build APK(s)**

Готовий debug-APK з’явиться в `app/build/outputs/apk/debug/`.

Меню (три крапки): головна, оновити, увімкнути/вимкнути онлайн-переклад описів.

## Вимоги

- Android 8.0+ (API 26)
- JDK 17 (йде з Android Studio)
- Інтернет

Скрипти `dictionary.js` і `translator.js` копіюються з `../chotot_uk_extension` під час збірки. Зміни в словнику підхопляться після Rebuild.

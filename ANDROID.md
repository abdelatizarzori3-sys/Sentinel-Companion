# Sentinel-Companion Android

تمت إضافة غلاف Capacitor أصلي في مجلد `android/` بمعرّف الحزمة `com.abdelatizarzori.sentinel`. يستخدم الغلاف محتوى `mobile-web/` ويحتفظ بتجربة الروبوت والصوت وحركة الشفاه داخل WebView.

## المتطلبات

يتطلب البناء Android Studio أو Android SDK مع JDK 21. لا تضع مفاتيح API أو ملف keystore داخل GitHub. ضع عنوان الخادم العام في إعدادات الواجهة قبل بناء إصدار الإنتاج.

## التطوير

```bash
npm install
npx cap sync android
npx cap open android
```

## APK للاختبار

```bash
cd android
./gradlew assembleDebug
```

ينتج الملف عادةً في `android/app/build/outputs/apk/debug/app-debug.apk`.

## AAB لـ Google Play

أنشئ keystore محليًا أو داخل مدير أسرار آمن، ثم اربط signing config في Android Studio. بعد ذلك شغّل:

```bash
cd android
./gradlew bundleRelease
```

ينتج ملف النشر عادةً في `android/app/build/outputs/bundle/release/app-release.aab`.

هذا الغلاف لا يضع أسرار الخادم في التطبيق. أي مفتاح ذكاء اصطناعي يجب أن يبقى على الخادم فقط.

## Developer

**Abdelati Zarzori** — `abdelatizarzori3@gmail.com`

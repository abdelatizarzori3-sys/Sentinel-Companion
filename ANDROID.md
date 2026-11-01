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

## مكتبة نصية شخصية (برو)

توجد في واجهة Android بطاقة «مكتبتي النصية · برو». عند تفعيلها باشتراك موثق، يستطيع صاحب الحساب حفظ حتى 100 سيناريو سؤال/جواب عربي محليًا، وحذفها، واستيراد أو تصدير ملف JSON بالمخطط التالي فقط:

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "scenario_…",
      "question": "سؤال عربي",
      "answer": "جواب عربي",
      "createdAt": "2026-10-31T08:30:00.000Z",
      "updatedAt": "2026-10-31T08:30:00.000Z"
    }
  ]
}
```

يُرفض الاستيراد الذري عند الحقول الإضافية، أو التكرار، أو روابط الملفات/الويب، أو نصوص تبدو أسرارًا، أو تجاوز الحدود. لا يرسل هذا المسار نصوص المكتبة إلى خدمة جديدة؛ ويُجاب محليًا فقط عندما يطابق السؤال سيناريو محفوظًا. التخزين المحلي يخص المحتوى فقط ولا يمثل دفعًا أو استحقاقًا.

### حد الاستحقاق المطلوب قبل الإطلاق

العميل يطلب `GET /api/entitlements/me` مع جلسة الحساب، ولا يفتح الميزة إلا إذا أعاد الخادم، بعد تحقق الاشتراك لدى مزود الدفع، استجابة مثل:

```json
{
  "verified": true,
  "subject": "account-owned-by-session",
  "subscription": {
    "status": "active",
    "currentPeriodEnd": "2030-01-01T00:00:00.000Z"
  }
}
```

يتحقق الخادم من هوية الجلسة وملكية الاشتراك والإلغاء والانتهاء؛ لا يجوز للعميل أو `localStorage` أو query string منح برو. لا يوجد في هذا المستودع بعد موفر دفع أو عملية شراء مكتملة: يلزم أولًا تحديد بلد التحصيل، المزود، وقناة Android (ومنها Google Play Billing إذا كانت النسخة موزعة عبر Play) ثم تنفيذ شراء داخل التطبيق وwebhook خادمي دائم ومعاد التكرار بأمان.

## Developer

**Abdelati Zarzori** — `abdelatizarzori3@gmail.com`

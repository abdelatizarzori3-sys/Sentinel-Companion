const CONFIG = {
  apiBase: (window.SENTINEL_API_BASE || localStorage.getItem('sentinel_api_base') || 'https://marokecho-jrrh7cuh.manus.space').replace(/\/$/, ''),
};

const Companion = {
  controller: null, messages: [], locale: 'ar-MA', voiceEnabled: false,
  voices: [], voiceName: '', listening: false, recognition: null, sensors: false,
  lastMotionAt: 0, weather: null,
};

const $ = id => document.getElementById(id);

function showToast(message, kind = 'info') {
  const toast = $('toast');
  if (!toast) return;
  const messageNode = $('toast-message');
  if (messageNode) messageNode.textContent = message;
  toast.style.borderColor = kind === 'error' ? 'rgba(248,113,113,.45)' : kind === 'success' ? 'rgba(74,222,128,.45)' : 'rgba(103,232,249,.35)';
  toast.dataset.open = 'true';
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.dataset.open = 'false'; }, 3600);
}

function updateServiceStatus() {
  const status = $('service-status');
  if (!status) return;
  status.textContent = CONFIG.apiBase ? 'الخادم العام مضبوط؛ المحادثة تستخدم خدمة Sentinel الفعلية عند الإرسال.' : 'لم يُضبط خادم Sentinel بعد؛ لا توجد ردود تجريبية.';
  status.className = CONFIG.apiBase ? 'mt-1 mb-0 text-xs text-emerald-300' : 'mt-1 mb-0 text-xs text-amber-300';
}

function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  Companion.voices = window.speechSynthesis.getVoices();
  const select = $('companion-voice');
  if (!select) return;
  select.innerHTML = '<option value="">اختيار تلقائي من الجهاز</option>';
  Companion.voices.forEach(voice => {
    const option = document.createElement('option');
    option.value = voice.name; option.textContent = `${voice.name} · ${voice.lang}`;
    select.appendChild(option);
  });
  select.value = Companion.voiceName;
}

function chosenVoice() {
  const localePrefix = Companion.locale.split('-')[0].toLowerCase();
  return Companion.voices.find(voice => voice.name === Companion.voiceName)
    || Companion.voices.find(voice => voice.lang.toLowerCase().startsWith(localePrefix))
    || Companion.voices.find(voice => voice.lang.toLowerCase().startsWith('ar'));
}

function speak(text) {
  if (!Companion.voiceEnabled || !('speechSynthesis' in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = chosenVoice();
  if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = Companion.locale;
  window.speechSynthesis.speak(utterance);
}

function previewVoice() {
  if (!('speechSynthesis' in window)) return showToast('النطق غير مدعوم في هذا الجهاز.', 'error');
  const line = Companion.locale === 'ar-MA' ? 'سلام، أنا Sentinel. نقدر نهضر معاك بالدارجة المغربية.' : Companion.locale === 'en-US' ? 'Hello, I am Sentinel, your voice companion.' : 'مرحبًا، أنا Sentinel، رفيقك الصوتي.';
  const enabled = Companion.voiceEnabled; Companion.voiceEnabled = true; speak(line); Companion.voiceEnabled = enabled;
}

function weatherContext() {
  if (!Companion.weather || Date.now() - Companion.weather.fetchedAt > 30 * 60 * 1000) return null;
  return Companion.weather;
}

async function sendMessage() {
  const input = $('companion-input'); const output = $('companion-stream'); const send = $('companion-send'); const stop = $('companion-stop');
  const content = input?.value.trim();
  if (!content || Companion.controller) return;
  if (!CONFIG.apiBase) {
    output.textContent = 'خادم Sentinel غير مضبوط بعد. لم تُنشأ إجابة بديلة أو تجريبية.';
    return showToast('المحادثة تحتاج خادم Sentinel منشورًا.', 'error');
  }
  input.value = ''; Companion.messages.push({ role: 'user', content });
  output.textContent = 'Sentinel يفكر…'; send.disabled = true; stop.disabled = false;
  Companion.controller = new AbortController();
  try {
    const response = await fetch(`${CONFIG.apiBase}/api/trpc/ai.sentinelReply?batch=1`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: Companion.controller.signal,
      body: JSON.stringify({ 0: { json: { messages: Companion.messages.slice(-12), locale: Companion.locale, context: weatherContext() } } }),
    });
    const payload = await response.json();
    const answer = payload?.[0]?.result?.data?.json?.reply;
    if (!response.ok || typeof answer !== 'string' || !answer.trim()) throw new Error(`الخادم أعاد ${response.status}`);
    output.textContent = answer.trim();
    Companion.messages.push({ role: 'assistant', content: answer.trim() }); speak(answer.trim());
  } catch (error) {
    if (error.name !== 'AbortError') { output.textContent = 'تعذر الاتصال بخادم Sentinel. لم تُعرض إجابة تجريبية.'; showToast('تعذر الاتصال بالخادم.', 'error'); }
  } finally { Companion.controller = null; send.disabled = false; stop.disabled = true; }
}

function stopStream() {
  Companion.controller?.abort(); Companion.controller = null;
  window.speechSynthesis?.cancel();
  $('companion-stop').disabled = true; $('companion-send').disabled = false;
}

function updateWeather() {
  const summary = $('weather-summary'); const sun = $('sun-times'); const button = $('weather-location');
  if (!navigator.geolocation) { summary.textContent = 'الموقع غير مدعوم في هذا الجهاز.'; return; }
  summary.textContent = 'نطلب إذن الموقع…'; button.disabled = true;
  navigator.geolocation.getCurrentPosition(async position => {
    try {
      const { latitude, longitude } = position.coords;
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude.toFixed(3)}&longitude=${longitude.toFixed(3)}&current=temperature_2m,wind_speed_10m&daily=sunrise,sunset&timezone=auto`);
      if (!response.ok) throw new Error('weather unavailable');
      const data = await response.json(); const current = data.current || {}; const daily = data.daily || {};
      Companion.weather = { temperature: Math.round(current.temperature_2m), wind: Math.round(current.wind_speed_10m || 0), sunrise: daily.sunrise?.[0], sunset: daily.sunset?.[0], fetchedAt: Date.now() };
      summary.textContent = `${Companion.weather.temperature}°C · رياح ${Companion.weather.wind} كم/س`;
      const time = value => value ? new Date(value).toLocaleTimeString(Companion.locale, { hour: '2-digit', minute: '2-digit' }) : '—';
      sun.textContent = `${time(Companion.weather.sunrise)} / ${time(Companion.weather.sunset)}`;
      $('location-map').src = `https://www.google.com/maps?q=${latitude},${longitude}&output=embed`;
      $('map-panel').classList.remove('hidden'); showToast('تم تحديث الطقس للجلسة فقط.', 'success');
    } catch { summary.textContent = 'تعذر جلب الطقس حاليًا.'; sun.textContent = '—'; showToast('تعذر الوصول لخدمة الطقس.', 'error'); }
    finally { button.disabled = false; }
  }, () => { summary.textContent = 'تم رفض إذن الموقع.'; button.disabled = false; showToast('لم يُمنح إذن الموقع.', 'error'); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

const jokes = [
  { ar: 'قال الإلكترون للبروتون: لا تقلق، أنا سالب المزاج فقط.', darija: 'قال الإلكتروني للبروتون: ما تقلقش، غير المود ديالي سالب شوية.', en: 'The electron told the proton: I am not negative, just low-energy.' },
  { ar: 'لماذا أخذ الفيزيائي سلّمًا إلى المختبر؟ لأن التجربة كانت على مستوى أعلى.', darija: 'علاش الفيزيائي دخل بالسلم للمختبر؟ حيت التجربة كانت ليفل عالي.', en: 'Why did the physicist bring a ladder? The experiment was on another level.' },
  { ar: 'قالت الخلية للمنبّه: أوقف الرنين، لدي انقسام في الجدول.', darija: 'قالت الخلية للمنبه: وقف الرنين، عندي انقسام فالبلانينغ.', en: 'The cell told the alarm: Stop ringing, I have division on my schedule.' },
];

function loadJoke() {
  const joke = jokes[Math.floor(Math.random() * jokes.length)];
  const text = Companion.locale === 'ar-MA' ? joke.darija : Companion.locale === 'en-US' ? joke.en : joke.ar;
  $('joke-text').textContent = text; speak(text);
}

function nativeRecognitionPlugin() {
  return window.Capacitor?.Plugins?.NativeSpeechRecognition || null;
}

async function refreshMicrophonePermission() {
  const plugin = nativeRecognitionPlugin(); const state = $('microphone-permission-state');
  if (!plugin || !state || typeof plugin.checkPermissions !== 'function') return;
  try {
    const permissions = await plugin.checkPermissions();
    const granted = permissions?.microphone === 'granted';
    state.textContent = granted ? 'إذن الميكروفون مفعّل' : 'إذن الميكروفون غير مفعّل';
    state.className = granted ? 'text-[11px] text-emerald-300' : 'text-[11px] text-amber-300';
  } catch {
    state.textContent = 'تعذر قراءة حالة الإذن'; state.className = 'text-[11px] text-amber-300';
  }
}

async function ensureNativeMicrophonePermission(plugin) {
  if (typeof plugin.checkPermissions !== 'function' || typeof plugin.requestPermissions !== 'function') return true;
  try {
    const current = await plugin.checkPermissions();
    if (current?.microphone === 'granted') return true;
    const requested = await plugin.requestPermissions({ permissions: ['microphone'] });
    await refreshMicrophonePermission();
    if (requested?.microphone === 'granted') return true;
    showToast('افتح إعدادات التطبيق ثم فعّل «الميكروفون» لـ Sentinel، وبعدها ارجع واضغط بدء الاستماع.', 'info');
    return false;
  } catch {
    showToast('تعذر طلب إذن الميكروفون. افتح الإعدادات وفَعِّله يدويًا.', 'info');
    return false;
  }
}

async function openMicrophoneSettings() {
  const plugin = nativeRecognitionPlugin();
  if (!plugin?.openAppSettings) return showToast('زر الإعدادات متاح داخل نسخة Android الجديدة فقط.', 'info');
  try {
    await plugin.openAppSettings();
    showToast('فعّل «الميكروفون» لتطبيق Sentinel من شاشة الإعدادات، ثم ارجع للتطبيق.', 'info');
  } catch {
    showToast('تعذر فتح إعدادات التطبيق. افتح إعدادات الهاتف ثم التطبيقات ثم Sentinel ثم الأذونات.', 'info');
  }
}

async function toggleNativeListening(plugin) {
  const button = $('listen-toggle');
  if (Companion.listening) {
    try { await plugin.stop(); } catch { /* The recognizer may already have stopped. */ }
    Companion.listening = false; button.textContent = 'بدء الاستماع'; return;
  }
  if (!await ensureNativeMicrophonePermission(plugin)) return;
  Companion.listening = true; button.textContent = 'إيقاف الاستماع';
  try {
    const result = await plugin.start({ language: Companion.locale });
    const text = result?.text?.trim();
    if (text) { $('companion-input').value = text; await sendMessage(); }
    else showToast('لم تُلتقط كلمات واضحة. حاول التحدث مرة أخرى أو اكتب رسالتك.', 'info');
  } catch (error) {
    const reason = String(error?.message || error);
    if (reason.includes('MICROPHONE_PERMISSION_DENIED')) showToast('لم يُمنح إذن الميكروفون. يمكنك متابعة المحادثة بالكتابة.', 'info');
    else if (reason.includes('RECOGNITION_UNAVAILABLE')) showToast('خدمة التعرف الصوتي غير متاحة على الجهاز حاليًا. اكتب رسالتك أو فعّل خدمة التعرف في إعدادات الهاتف.', 'info');
    else if (reason.includes('RECOGNITION_NETWORK_ERROR')) showToast('تعذر الوصول لخدمة التعرف الصوتي. تحقق من الإنترنت ثم حاول مجددًا.', 'info');
    else if (!reason.includes('NO_SPEECH') && !reason.includes('RECOGNITION_CANCELLED')) showToast('تعذر التقاط الصوت الآن. يمكنك متابعة المحادثة بالكتابة.', 'info');
  } finally {
    Companion.listening = false; button.textContent = 'بدء الاستماع'; refreshMicrophonePermission();
  }
}

function toggleListening() {
  const nativePlugin = nativeRecognitionPlugin();
  if (nativePlugin) return toggleNativeListening(nativePlugin);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return showToast('الاستماع الصوتي غير مدعوم هنا. اكتب رسالتك وسيجيب Sentinel مباشرة.', 'info');
  if (Companion.listening) { Companion.listening = false; Companion.recognition?.stop(); $('listen-toggle').textContent = 'بدء الاستماع'; return; }
  if (!navigator.mediaDevices?.getUserMedia) return showToast('لا تتوفر واجهة الميكروفون في هذا الجهاز. استخدم الكتابة للمحادثة.', 'info');
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    stream.getTracks().forEach(track => track.stop());
    startRecognition(Recognition);
  }).catch(() => showToast('لم يُمنح إذن الميكروفون. يمكنك متابعة المحادثة بالكتابة.', 'info'));
}

function startRecognition(Recognition) {
  const recognition = new Recognition(); recognition.lang = Companion.locale; recognition.interimResults = false;
  recognition.onresult = event => { const text = event.results[0]?.[0]?.transcript?.trim(); if (text) { $('companion-input').value = text; sendMessage(); } };
  recognition.onerror = () => showToast('تعذر تشغيل الاستماع. يمكنك متابعة المحادثة بالكتابة.', 'info');
  recognition.onend = () => { Companion.listening = false; $('listen-toggle').textContent = 'بدء الاستماع'; };
  Companion.recognition = recognition; Companion.listening = true; recognition.start(); $('listen-toggle').textContent = 'إيقاف الاستماع';
}

function updateVoiceCapability() {
  const nativePlugin = nativeRecognitionPlugin();
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const listen = $('listen-toggle'); const fallback = $('voice-fallback');
  if (nativePlugin) {
    listen.disabled = false;
    listen.textContent = 'بدء الاستماع';
    fallback.textContent = 'يستخدم Sentinel خدمة التعرف الصوتي الأصلية في Android. سيطلب الإذن مرة واحدة عند بدء الاستماع؛ تبقى المحادثة النصية متاحة دائمًا.';
    return;
  }
  if (!Recognition) {
    listen.disabled = true;
    listen.textContent = 'الاستماع غير مدعوم';
    fallback.textContent = 'هذا الجهاز لا يدعم الاستماع الصوتي داخل التطبيق. اكتب رسالتك في الحقل أدناه؛ المحادثة النصية تعمل بشكل مستقل.';
  }
}

async function toggleSensors() {
  if (!window.isSecureContext || typeof DeviceMotionEvent === 'undefined') return showToast('الحركة تحتاج HTTPS ودعم الجهاز.', 'error');
  if (typeof DeviceMotionEvent.requestPermission === 'function' && await DeviceMotionEvent.requestPermission() !== 'granted') return showToast('لم يُمنح إذن الحركة.', 'error');
  Companion.sensors = !Companion.sensors; $('sensor-toggle').textContent = Companion.sensors ? 'الحركة مفعّلة' : 'تفعيل الحركة';
  if (Companion.sensors) window.addEventListener('devicemotion', onMotion); else window.removeEventListener('devicemotion', onMotion);
}

function onMotion(event) {
  const a = event.accelerationIncludingGravity; const now = Date.now();
  if (!Companion.sensors || !a || Math.hypot(a.x || 0, a.y || 0, a.z || 0) < 18 || now - Companion.lastMotionAt < 30000) return;
  Companion.lastMotionAt = now; showToast('تم رصد حركة؛ يمكنك التحدث مع Sentinel عندما تكون جاهزًا.');
}

function init() {
  updateServiceStatus(); updateVoiceCapability(); refreshMicrophonePermission(); loadVoices(); window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
  $('connection-help').addEventListener('click', () => showToast(CONFIG.apiBase ? `الخادم المحدد: ${CONFIG.apiBase}` : 'لا يوجد خادم Sentinel محدد في هذه النسخة.', CONFIG.apiBase ? 'info' : 'error'));
  $('companion-send').addEventListener('click', sendMessage); $('companion-stop').addEventListener('click', stopStream);
  $('companion-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); sendMessage(); } });
  $('companion-locale').addEventListener('change', event => { Companion.locale = event.target.value; loadVoices(); });
  $('companion-voice').addEventListener('change', event => { Companion.voiceName = event.target.value; });
  $('voice-toggle').addEventListener('click', () => { Companion.voiceEnabled = !Companion.voiceEnabled; $('voice-toggle').textContent = Companion.voiceEnabled ? 'الصوت مفعّل' : 'الصوت متوقف'; });
  $('preview-voice').addEventListener('click', previewVoice); $('listen-toggle').addEventListener('click', toggleListening); $('sensor-toggle').addEventListener('click', toggleSensors);
  $('microphone-settings')?.addEventListener('click', openMicrophoneSettings);
  $('weather-location').addEventListener('click', updateWeather); $('joke-load').addEventListener('click', loadJoke);
  $('toast-dismiss').addEventListener('click', () => { $('toast').dataset.open = 'false'; });
}

document.addEventListener('DOMContentLoaded', init);

const CONFIG = {
  apiBase: (window.SENTINEL_API_BASE || localStorage.getItem('sentinel_api_base') || '').replace(/\/$/, ''),
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
  toast.textContent = message;
  toast.style.borderColor = kind === 'error' ? 'rgba(248,113,113,.45)' : kind === 'success' ? 'rgba(74,222,128,.45)' : 'rgba(103,232,249,.35)';
  toast.dataset.open = 'true';
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => { toast.dataset.open = 'false'; }, 3600);
}

function updateServiceStatus() {
  const status = $('service-status');
  if (!status) return;
  status.textContent = CONFIG.apiBase ? 'الخادم مضبوط؛ المحادثة ستتصل به عند الإرسال.' : 'لم يُضبط خادم Sentinel بعد؛ لا توجد ردود تجريبية.';
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
    const response = await fetch(`${CONFIG.apiBase}/api/chat/stream`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: Companion.controller.signal,
      body: JSON.stringify({ messages: Companion.messages.slice(-12), locale: Companion.locale, context: weatherContext() }),
    });
    if (!response.ok || !response.body) throw new Error(`الخادم أعاد ${response.status}`);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ''; let answer = '';
    output.textContent = '';
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n'); buffer = frames.pop() || '';
      for (const frame of frames) {
        const line = frame.split('\n').find(item => item.startsWith('data:'));
        if (!line) continue;
        const payload = JSON.parse(line.slice(5));
        if (payload.delta) { answer += payload.delta; output.textContent = answer; }
      }
    }
    if (answer) { Companion.messages.push({ role: 'assistant', content: answer }); speak(answer); }
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

function toggleListening() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return showToast('الاستماع غير مدعوم في هذا الجهاز.', 'error');
  if (Companion.listening) { Companion.listening = false; Companion.recognition?.stop(); $('listen-toggle').textContent = 'بدء الاستماع'; return; }
  const recognition = new Recognition(); recognition.lang = Companion.locale; recognition.interimResults = false;
  recognition.onresult = event => { const text = event.results[0]?.[0]?.transcript?.trim(); if (text) { $('companion-input').value = text; sendMessage(); } };
  recognition.onerror = () => showToast('تعذر الوصول للميكروفون.', 'error');
  recognition.onend = () => { Companion.listening = false; $('listen-toggle').textContent = 'بدء الاستماع'; };
  Companion.recognition = recognition; Companion.listening = true; recognition.start(); $('listen-toggle').textContent = 'إيقاف الاستماع';
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
  updateServiceStatus(); loadVoices(); window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
  $('connection-help').addEventListener('click', () => showToast(CONFIG.apiBase ? `الخادم المحدد: ${CONFIG.apiBase}` : 'لا يوجد خادم Sentinel محدد في هذه النسخة.', CONFIG.apiBase ? 'info' : 'error'));
  $('companion-send').addEventListener('click', sendMessage); $('companion-stop').addEventListener('click', stopStream);
  $('companion-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); sendMessage(); } });
  $('companion-locale').addEventListener('change', event => { Companion.locale = event.target.value; loadVoices(); });
  $('companion-voice').addEventListener('change', event => { Companion.voiceName = event.target.value; });
  $('voice-toggle').addEventListener('click', () => { Companion.voiceEnabled = !Companion.voiceEnabled; $('voice-toggle').textContent = Companion.voiceEnabled ? 'الصوت مفعّل' : 'الصوت متوقف'; });
  $('preview-voice').addEventListener('click', previewVoice); $('listen-toggle').addEventListener('click', toggleListening); $('sensor-toggle').addEventListener('click', toggleSensors);
  $('weather-location').addEventListener('click', updateWeather); $('joke-load').addEventListener('click', loadJoke);
}

document.addEventListener('DOMContentLoaded', init);

const CONFIG = {
  apiBase: (window.SENTINEL_API_BASE || localStorage.getItem('sentinel_api_base') || 'https://marokecho-jrrh7cuh.manus.space').replace(/\/$/, ''),
};

const Companion = {
  controller: null, messages: [], locale: 'ar-MA', voiceEnabled: true,
  voices: [], voiceName: '', listening: false, recognition: null, sensors: false,
  lastMotionAt: 0, weather: null, recording: false, callActive: false, callTimer: null, callTurnInProgress: false, speechTimer: null,
};

const $ = id => document.getElementById(id);

function setRobotState(state = 'idle', label = 'جاهز للتفاعل') {
  const stage = $('robot-stage'); const caption = $('robot-state-label');
  if (stage) stage.dataset.state = state;
  if (caption) caption.textContent = label;
}

function setVoiceStage(stage = 'ready', note = 'جاهز للاستماع أو الكتابة.') {
  const pipeline = $('voice-pipeline'); const noteNode = $('voice-stage-note');
  if (pipeline) pipeline.dataset.stage = stage;
  if (noteNode) noteNode.textContent = note;
  const order = ['recording', 'transcription', 'reply', 'speaking'];
  const activeIndex = order.indexOf(stage);
  document.querySelectorAll('.voice-step').forEach((item, index) => {
    item.classList.remove('active', 'done', 'error');
    if (stage === 'error' && index === 0) item.classList.add('error');
    else if (activeIndex >= 0 && index < activeIndex) item.classList.add('done');
    else if (index === activeIndex) item.classList.add('active');
  });
}

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
  if (!Companion.voiceEnabled || !text.trim()) return Promise.resolve(false);
  const nativeTts = window.Capacitor?.Plugins?.NativeTextToSpeech;
  if (nativeTts?.speak) {
    setRobotState('speaking', 'Sentinel يتحدث الآن');
    setVoiceStage('speaking', 'Sentinel ينطق الرد الآن — حركة الشفاه مفعّلة.');
    return nativeTts.speak({ text, locale: Companion.locale })
      .then(result => new Promise(resolve => {
        if (!result?.started) throw new Error('TTS_NOT_STARTED');
        if (result.fallbackLanguage) showToast(`استخدم Sentinel صوتًا بديلًا (${result.locale || 'الافتراضي'}).`, 'info');
        window.clearTimeout(Companion.speechTimer);
        Companion.speechTimer = window.setTimeout(() => { setRobotState('idle', 'جاهز للتفاعل'); setVoiceStage('ready'); resolve(true); }, Number(result.estimatedDurationMs) || 1800);
      }))
      .catch(error => {
        const reason = String(error?.message || error);
        const note = reason.includes('LANGUAGE') ? 'خدمة نطق العربية غير مثبتة في الهاتف.' : 'لم تبدأ خدمة نطق الجهاز.';
        setVoiceStage('error', `${note} الرد مكتوب أمامك.`);
        showToast(`${note} فعّل محرك تحويل النص إلى كلام من إعدادات الهاتف.`, 'info');
        setRobotState('idle', 'جاهز للتفاعل');
        return false;
      });
  }
  if (!('speechSynthesis' in window)) return Promise.resolve(false);
  window.speechSynthesis.cancel();
  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);
    const voice = chosenVoice();
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; } else utterance.lang = Companion.locale;
    utterance.onstart = () => { setRobotState('speaking', 'Sentinel يتحدث الآن'); setVoiceStage('speaking', 'Sentinel ينطق الرد الآن — حركة الشفاه مفعّلة.'); };
    utterance.onend = () => { setRobotState('idle', 'جاهز للتفاعل'); setVoiceStage('ready'); resolve(true); };
    utterance.onerror = () => { setRobotState('idle', 'جاهز للتفاعل'); setVoiceStage('error', 'توقف عند مرحلة النطق في الجهاز؛ الرد مكتوب أمامك.'); resolve(false); };
    window.speechSynthesis.speak(utterance);
  });
}

function previewVoice() {
  if (!window.Capacitor?.Plugins?.NativeTextToSpeech && !('speechSynthesis' in window)) return showToast('النطق غير مدعوم في هذا الجهاز.', 'error');
  const line = Companion.locale === 'ar-MA' ? 'سلام، أنا Sentinel. نقدر نهضر معاك بالدارجة المغربية.' : Companion.locale === 'en-US' ? 'Hello, I am Sentinel, your voice companion.' : 'مرحبًا، أنا Sentinel، رفيقك الصوتي.';
  const enabled = Companion.voiceEnabled; Companion.voiceEnabled = true;
  return Promise.resolve(speak(line)).finally(() => { Companion.voiceEnabled = enabled; });
}

async function verifyVoiceEngine() {
  const tts = window.Capacitor?.Plugins?.NativeTextToSpeech;
  if (!tts?.checkStatus) return previewVoice();
  try {
    const status = await tts.checkStatus({ locale: Companion.locale });
    if (!status?.ready) throw new Error('TTS_UNAVAILABLE');
    if (!status.requestedLanguageAvailable) {
      setVoiceStage('error', 'صوت العربية غير مثبت؛ لن ينطق Sentinel النص العربي بصوت غير مناسب.');
      showToast('ثبّت صوت العربية من إعدادات محرك النص إلى كلام، ثم أعد الفحص.', 'info');
      return;
    }
    setVoiceStage('speaking', 'محرك صوت Android جاهز؛ بدأ اختبار النطق.');
    await previewVoice();
  } catch {
    setVoiceStage('error', 'محرك نطق Android غير جاهز أو لا يحتوي صوت العربية.');
    showToast('خدمة نطق العربية غير جاهزة. فعّل «تحويل النص إلى كلام» من إعدادات الهاتف.', 'error');
  }
}

async function openTtsSettings() {
  const tts = window.Capacitor?.Plugins?.NativeTextToSpeech;
  if (!tts?.openTtsSettings) return showToast('افتح إعدادات الهاتف وابحث عن «تحويل النص إلى كلام» ثم نزّل صوت العربية.', 'info');
  try {
    await tts.openTtsSettings();
    showToast('اختر محرك النص إلى كلام ثم نزّل صوت العربية أو العربية المغربية إن ظهر.', 'info');
  } catch {
    showToast('تعذر فتح إعدادات الصوت. افتح إعدادات الهاتف وابحث عن «تحويل النص إلى كلام».', 'info');
  }
}

function weatherContext() {
  if (!Companion.weather || Date.now() - Companion.weather.fetchedAt > 30 * 60 * 1000) return null;
  return Companion.weather;
}

const pause = milliseconds => new Promise(resolve => window.setTimeout(resolve, milliseconds));

async function postSentinel(operation, json, signal) {
  const transport = nativeSentinelTransport();
  const body = JSON.stringify({ 0: { json } });
  if (isNativeAndroid() && transport?.post) {
    const result = await transport.post({ operation, body });
    return { status: Number(result?.status || 0), payload: JSON.parse(result?.body || 'null') };
  }
  const path = operation === 'transcribe' ? 'voice.sentinelTranscribe' : 'ai.sentinelReply';
  const response = await fetch(`${CONFIG.apiBase}/api/trpc/${path}?batch=1`, {
    method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal, body,
  });
  return { status: response.status, payload: await response.json().catch(() => null) };
}

async function requestSentinelReply(messages, signal) {
  let lastError = new Error('SENTINEL_REPLY_UNAVAILABLE');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { status, payload } = await postSentinel('reply', { messages, locale: Companion.locale, context: weatherContext() }, signal);
      const reply = payload?.[0]?.result?.data?.json?.reply;
      if (status >= 200 && status < 300 && typeof reply === 'string' && reply.trim()) return reply.trim();
      lastError = new Error(payload?.[0]?.error?.json?.message || `HTTP_${status}`);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      lastError = error instanceof Error ? error : lastError;
    }
    if (attempt === 0) await pause(450);
  }
  throw lastError;
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
  output.textContent = 'Sentinel يفكر…'; send.disabled = true; stop.disabled = false; setRobotState('thinking', 'Sentinel يفكر في رد مناسب'); setVoiceStage('reply', 'وصل النص إلى Sentinel؛ يجري إعداد الرد الآن.');
  Companion.controller = new AbortController();
  try {
    const answer = await requestSentinelReply(Companion.messages.slice(-12), Companion.controller.signal);
    output.textContent = answer;
    Companion.messages.push({ role: 'assistant', content: answer }); speak(answer);
  } catch (error) {
    if (error.name !== 'AbortError') {
      const statusReply = 'سمعت رسالتك، ولكن خادم Sentinel لم يرد الآن. سأبقى جاهزًا؛ جرّب مرة أخرى بعد لحظات أو اكتب رسالتك.';
      output.textContent = statusReply;
      setVoiceStage('speaking', 'الخادم تعذر مؤقتًا؛ Sentinel ينطق حالة الاتصال بوضوح.');
      showToast('تعذر الاتصال بالخادم بعد محاولتين. نطقت لك حالة الاتصال بدل الصمت.', 'error');
      speak(statusReply);
    }
  } finally { Companion.controller = null; send.disabled = false; stop.disabled = true; if (!Companion.voiceEnabled) { setRobotState('idle', 'جاهز للتفاعل'); setVoiceStage('ready'); } }
}

function stopStream() {
  Companion.controller?.abort(); Companion.controller = null;
  window.clearTimeout(Companion.speechTimer);
  window.Capacitor?.Plugins?.NativeTextToSpeech?.stop?.().catch(() => {});
  window.speechSynthesis?.cancel();
  setRobotState('idle', 'تم إيقاف الاستجابة');
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

function isNativeAndroid() {
  return window.Capacitor?.getPlatform?.() === 'android' || Boolean(window.Capacitor?.isNativePlatform?.());
}

function nativeAudioRecorderPlugin() {
  return window.Capacitor?.Plugins?.NativeAudioRecorder || null;
}

function nativeSentinelTransport() {
  return window.Capacitor?.Plugins?.NativeSentinelTransport || null;
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
  const plugin = nativeAudioRecorderPlugin() || nativeRecognitionPlugin();
  if (!plugin?.openAppSettings) return showToast('زر الإعدادات متاح داخل نسخة Android الجديدة فقط.', 'info');
  try {
    await plugin.openAppSettings();
    showToast('فعّل «الميكروفون» لتطبيق Sentinel من شاشة الإعدادات، ثم ارجع للتطبيق.', 'info');
  } catch {
    showToast('تعذر فتح إعدادات التطبيق. افتح إعدادات الهاتف ثم التطبيقات ثم Sentinel ثم الأذونات.', 'info');
  }
}

async function requestSentinelTranscription(recording) {
  const { status, payload } = await postSentinel('transcribe', { audioBase64: recording.audioBase64, mimeType: recording.mimeType || 'audio/mp4', locale: Companion.locale });
  const text = payload?.[0]?.result?.data?.json?.text;
  if (status < 200 || status >= 300 || typeof text !== 'string' || !text.trim()) throw new Error(payload?.[0]?.error?.json?.message || 'TRANSCRIPTION_FAILED');
  return text.trim();
}

async function toggleRecordedConversation(plugin) {
  const button = $('listen-toggle'); const output = $('companion-stream');
  if (!Companion.recording) {
    if (!await ensureNativeMicrophonePermission(plugin)) return;
    try {
      await plugin.startRecording();
      Companion.recording = true; Companion.listening = true;
      button.textContent = 'إنهاء وإرسال الصوت';
      output.textContent = 'Sentinel يستمع… تكلّم الآن، ثم اضغط الزر مرة ثانية للإرسال.';
      setRobotState('listening', 'أستمع إليك الآن…'); setVoiceStage('recording', 'التسجيل يعمل الآن. تكلّم ثم اضغط الزر مرة ثانية للإرسال.');
    } catch {
      showToast('تعذر بدء تسجيل الصوت. تحقق من إذن الميكروفون ثم حاول مجددًا.', 'error');
      setRobotState('idle', 'جاهز للتفاعل');
    }
    return;
  }
  try {
    button.disabled = true; output.textContent = 'Sentinel يحوّل صوتك إلى نص…'; setRobotState('thinking', 'أحوّل صوتك إلى نص…'); setVoiceStage('transcription', 'يرسل التسجيل للتحويل إلى نص…');
    const recording = await plugin.stopRecording();
    Companion.recording = false; Companion.listening = false;
    const text = await requestSentinelTranscription(recording);
    $('companion-input').value = text;
    output.textContent = `سمعتك تقول: ${text}`;
    await sendMessage();
  } catch (error) {
    const reason = String(error?.message || error);
    if (reason.includes('AUDIO_TOO_SHORT') || reason.includes('AUDIO_EMPTY')) showToast('المقطع قصير جدًا. تكلّم لثانية واحدة على الأقل ثم أرسله.', 'info');
    else if (reason.includes('AUDIO_TOO_LARGE')) showToast('المقطع طويل. أرسل رسالة صوتية أقصر.', 'info');
    else showToast(reason.includes('تعذر') ? reason : 'تعذر تحويل صوتك إلى نص الآن. جرّب رسالة أقصر أو اكتبها.', 'error');
    output.textContent = 'لم تكتمل الرسالة الصوتية. يمكنك المحاولة مرة أخرى أو الكتابة.'; setVoiceStage('error', `توقفت دورة الصوت: ${reason.includes('AUDIO') ? 'التسجيل' : 'تحويل الصوت إلى نص'}.`);
  } finally {
    Companion.recording = false; Companion.listening = false; button.disabled = false; button.textContent = 'بدء الاستماع'; refreshMicrophonePermission();
    if (!Companion.controller) setRobotState('idle', 'جاهز للتفاعل');
  }
}

function updateCallUi(label, active) {
  const button = $('call-toggle'); const status = $('call-status');
  if (button) { button.dataset.active = String(active); button.textContent = active ? 'إنهاء الاتصال الصوتي' : 'بدء اتصال صوتي'; }
  if (status) { status.dataset.active = String(active); status.textContent = label; }
}

async function endVoiceCall(note = 'انتهى الاتصال الصوتي. يمكنك البدء من جديد متى شئت.') {
  Companion.callActive = false; Companion.callTurnInProgress = false;
  if (Companion.callTimer) window.clearTimeout(Companion.callTimer);
  Companion.callTimer = null;
  if (Companion.recording) { try { await nativeAudioRecorderPlugin()?.stopRecording(); } catch { /* recording already stopped */ } }
  Companion.recording = false; Companion.listening = false;
  window.Capacitor?.Plugins?.NativeTextToSpeech?.stop?.().catch(() => {});
  updateCallUi(note, false); setRobotState('idle', 'جاهز للتفاعل'); setVoiceStage('ready');
}

function scheduleCallTurn(delay = 500) {
  if (!Companion.callActive) return;
  Companion.callTimer = window.setTimeout(() => runVoiceCallTurn(), delay);
}

async function runVoiceCallTurn() {
  const recorder = nativeAudioRecorderPlugin();
  if (!Companion.callActive || !recorder || Companion.callTurnInProgress) return;
  Companion.callTurnInProgress = true;
  const output = $('companion-stream');
  try {
    await recorder.startRecording();
    Companion.recording = true; Companion.listening = true;
    updateCallUi('الاتصال متصل — Sentinel يستمع الآن.', true);
    setRobotState('listening', 'أستمع إليك في الاتصال…'); setVoiceStage('recording', 'الاتصال يستمع لرسالتك الآن.');
    await pause(4200);
    if (!Companion.callActive) return;
    const recording = await recorder.stopRecording();
    Companion.recording = false; Companion.listening = false;
    setRobotState('thinking', 'أحوّل صوتك إلى نص…'); setVoiceStage('transcription', 'الاتصال يحوّل الصوت إلى نص…');
    const text = await requestSentinelTranscription(recording);
    Companion.messages.push({ role: 'user', content: text });
    output.textContent = `سمعتك تقول: ${text}\n\nSentinel يفكر…`;
    setVoiceStage('reply', 'Sentinel يحضّر ردًا صوتيًا…');
    const reply = await requestSentinelReply(Companion.messages.slice(-12));
    Companion.messages.push({ role: 'assistant', content: reply });
    output.textContent = reply;
    updateCallUi('Sentinel يرد الآن — سيتابع الاستماع بعد انتهاء النطق.', true);
    await speak(reply);
  } catch (error) {
    const reason = String(error?.message || error);
    output.textContent = 'تعذر إكمال هذه الدورة من الاتصال. سيحاول Sentinel الاستماع من جديد.';
    setVoiceStage('error', `توقفت دورة الاتصال: ${reason.includes('TRANSCRIPTION') ? 'تحويل الصوت إلى نص' : 'الرد أو الاتصال'}.`);
    showToast('توقفت دورة اتصال واحدة؛ سيعاد الاستماع بعد لحظات.', 'info');
  } finally {
    Companion.recording = false; Companion.listening = false; Companion.callTurnInProgress = false;
    if (Companion.callActive) scheduleCallTurn(650);
  }
}

async function toggleVoiceCall() {
  if (Companion.callActive) return endVoiceCall();
  const recorder = nativeAudioRecorderPlugin();
  if (!recorder) { updateCallUi('مسجل Android الأصلي غير جاهز؛ لا يمكن بدء الاتصال.', false); return showToast('لا يبدأ الاتصال قبل جاهزية مسجل Sentinel الأصلي.', 'error'); }
  if (!await ensureNativeMicrophonePermission(recorder)) return;
  Companion.callActive = true;
  updateCallUi('جار فتح الاتصال الصوتي…', true);
  await speak('سلام، أنا Sentinel. الاتصال الصوتي مفتوح، كنسمع ليك دابا.');
  scheduleCallTurn(180);
}

async function toggleNativeListening(plugin) {
  const button = $('listen-toggle');
  if (Companion.listening) {
    try { await plugin.stop(); } catch { /* The recognizer may already have stopped. */ }
    Companion.listening = false; button.textContent = 'بدء الاستماع'; setRobotState('idle', 'تم إيقاف الاستماع'); return;
  }
  if (!await ensureNativeMicrophonePermission(plugin)) return;
  Companion.listening = true; button.textContent = 'إيقاف الاستماع'; setRobotState('listening', 'أستمع إليك الآن…');
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
    Companion.listening = false; button.textContent = 'بدء الاستماع'; refreshMicrophonePermission(); if (!Companion.voiceEnabled) setRobotState('idle', 'جاهز للتفاعل');
  }
}

function toggleListening() {
  const recorder = nativeAudioRecorderPlugin();
  if (recorder) return toggleRecordedConversation(recorder);
  if (isNativeAndroid()) {
    setVoiceStage('error', 'مسجل Sentinel الأصلي لم يبدأ بعد. أعد فتح التطبيق أو ثبّت النسخة الجديدة.');
    return showToast('مسجل Sentinel الأصلي غير جاهز. لا تستخدم هذه النسخة إذن WebView كبديل.', 'error');
  }
  const nativePlugin = nativeRecognitionPlugin();
  if (nativePlugin) return toggleNativeListening(nativePlugin);
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return showToast('الاستماع الصوتي غير مدعوم هنا. اكتب رسالتك وسيجيب Sentinel مباشرة.', 'info');
  if (Companion.listening) { Companion.listening = false; Companion.recognition?.stop(); $('listen-toggle').textContent = 'بدء الاستماع'; setRobotState('idle', 'تم إيقاف الاستماع'); return; }
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
  Companion.recognition = recognition; Companion.listening = true; recognition.start(); $('listen-toggle').textContent = 'إيقاف الاستماع'; setRobotState('listening', 'أستمع إليك الآن…');
}

function updateVoiceCapability() {
  const recorder = nativeAudioRecorderPlugin();
  const nativePlugin = nativeRecognitionPlugin();
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const listen = $('listen-toggle'); const fallback = $('voice-fallback');
  if (recorder) {
    listen.disabled = false;
    listen.textContent = 'بدء الاستماع';
    fallback.textContent = 'مسار التسجيل الأصلي جاهز: سجّل رسالتك ثم أرسلها للتحويل إلى نص والرد المنطوق.';
    return;
  }
  if (isNativeAndroid()) {
    listen.disabled = true;
    listen.textContent = 'جار تهيئة مسجل الصوت';
    fallback.textContent = 'لم يبدأ مسجل Sentinel الأصلي بعد. أغلق التطبيق وافتحه، أو ثبّت النسخة الأحدث. لن يعود التطبيق إلى إذن WebView القديم.';
    setVoiceStage('error', 'مسجل Sentinel الأصلي غير مسجّل داخل Android.');
    return;
  }
  if (nativePlugin) {
    listen.disabled = false;
    listen.textContent = 'بدء الاستماع';
    fallback.textContent = 'يستخدم Sentinel خدمة التعرف الصوتي الأصلية في هذا الجهاز. تبقى المحادثة النصية متاحة دائمًا.';
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
  setRobotState('idle', 'جاهز للتفاعل'); setVoiceStage('ready'); updateServiceStatus(); updateVoiceCapability(); refreshMicrophonePermission(); loadVoices(); window.speechSynthesis?.addEventListener('voiceschanged', loadVoices);
  $('connection-help').addEventListener('click', () => showToast(CONFIG.apiBase ? `الخادم المحدد: ${CONFIG.apiBase}` : 'لا يوجد خادم Sentinel محدد في هذه النسخة.', CONFIG.apiBase ? 'info' : 'error'));
  $('companion-send').addEventListener('click', sendMessage); $('companion-stop').addEventListener('click', stopStream);
  $('companion-input').addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); sendMessage(); } });
  $('companion-locale').addEventListener('change', event => { Companion.locale = event.target.value; loadVoices(); });
  $('companion-voice').addEventListener('change', event => { Companion.voiceName = event.target.value; });
  $('voice-toggle').textContent = 'الصوت مفعّل';
  $('voice-toggle').addEventListener('click', () => { Companion.voiceEnabled = !Companion.voiceEnabled; $('voice-toggle').textContent = Companion.voiceEnabled ? 'الصوت مفعّل' : 'الصوت متوقف'; });
  $('preview-voice').addEventListener('click', verifyVoiceEngine); $('listen-toggle').addEventListener('click', toggleListening); $('call-toggle').addEventListener('click', toggleVoiceCall); $('sensor-toggle').addEventListener('click', toggleSensors);
  $('microphone-settings')?.addEventListener('click', openMicrophoneSettings);
  $('tts-settings')?.addEventListener('click', openTtsSettings);
  $('weather-location').addEventListener('click', updateWeather); $('joke-load').addEventListener('click', loadJoke);
  $('toast-dismiss').addEventListener('click', () => { $('toast').dataset.open = 'false'; });
}

document.addEventListener('DOMContentLoaded', init);

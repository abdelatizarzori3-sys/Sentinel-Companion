const CONFIG = {
  apiBase: (window.SENTINEL_API_BASE || localStorage.getItem('sentinel_api_base') || 'https://marokecho-jrrh7cuh.manus.space').replace(/\/$/, ''),
};

const BUILD_ID = 'PERSONAL-LIBRARY-PRO-20261031.1';
const Companion = {
  locale: 'ar-MA', messages: [], controller: null, active: false, recording: false,
  turnTimer: null, turnDelayResolve: null, speechTimer: null, speechResolve: null, turnInProgress: false,
  personalLibrary: null, entitlement: window.SentinelProEntitlement || null,
};

const TURN_DURATION_MS = 6500;
const REPLY_TIMEOUT_MS = 45_000;
const NATIVE_REPLY_TIMEOUT_MS = 42_000;
const LOCAL_LIBRARY_DEADLINE_MS = 15_000;
const $ = id => document.getElementById(id);

function setRobotState(state = 'idle', label = 'اضغط النقطة الخضراء وتكلّم') {
  const stage = $('robot-stage');
  const caption = $('robot-state-label');
  if (stage) stage.dataset.state = state;
  if (caption) caption.textContent = label;
}

function setKnowledgeStatus(label) {
  const status = $('knowledge-status');
  if (status) status.textContent = label;
}

function createTraceId() {
  const raw = window.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 12)
    || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `sc-${raw}`;
}

function knowledgeLabel(knowledge) {
  if (knowledge?.local) return `جواب احتياطي · مكتبة Android الداخلية (${window.SentinelLocalLibrary?.topicCount || 0} مجال)`;
  if (knowledge?.fallback) return 'جواب احتياطي · مكتبة Sentinel الداخلية';
  if (knowledge?.fresh && knowledge?.mode === 'combined') return 'وصل الجواب · مكتبة + مصدر عام حي';
  if (knowledge?.fresh) return 'وصل الجواب · مصدر عام حي';
  return 'وصل الجواب · مكتبة Sentinel الداخلية';
}

function displayReply(answer) {
  const blocks = [answer.reply];
  if (Array.isArray(answer.suggestions) && answer.suggestions.length) {
    blocks.push(`اقتراحات:\n${answer.suggestions.map(item => `• ${item}`).join('\n')}`);
  }
  if (Array.isArray(answer.plan) && answer.plan.length) {
    blocks.push(`الخطة:\n${answer.plan.map((item, index) => `${index + 1}. ${item}`).join('\n')}`);
  }
  return blocks.join('\n\n');
}

function setVoiceControls(active) {
  const start = $('voice-start');
  const stop = $('voice-stop');
  if (start) { start.disabled = active; start.dataset.active = String(active); }
  if (stop) stop.disabled = !active;
}

function appendChatMessage(role, text) {
  const log = $('chat-log');
  if (!log || !text) return;
  const message = document.createElement('p');
  message.className = `chat-message chat-message--${role}`;
  message.textContent = text;
  log.appendChild(message);
  log.scrollTop = log.scrollHeight;
  return message;
}

function removeChatMessage(message) {
  message?.remove?.();
}

function setChatBusy(busy) {
  const input = $('chat-input');
  const send = $('chat-send');
  const abort = $('chat-abort');
  if (input) input.disabled = busy;
  if (send) send.disabled = busy;
  if (abort) abort.disabled = !busy;
}

function libraryErrorMessage(code) {
  const messages = {
    INVALID_JSON: 'ملف JSON غير صالح.', INVALID_BACKUP: 'بنية النسخة الاحتياطية غير صالحة.',
    UNEXPECTED_BACKUP_FIELD: 'الملف يحتوي حقولًا غير مسموحة.', UNEXPECTED_ENTRY_FIELD: 'أحد السيناريوهات يحتوي حقولًا غير مسموحة.',
    INVALID_QUESTION: 'اكتب سؤالًا عربيًا من 3 إلى 280 حرفًا، من دون روابط أو أسرار.',
    INVALID_ANSWER: 'اكتب جوابًا عربيًا من 3 إلى 1600 حرف، من دون روابط أو أسرار.',
    INVALID_ID: 'معرّف السيناريو غير صالح.', INVALID_TIMESTAMP: 'تاريخ أحد السيناريوهات غير صالح.',
    INVALID_TIMESTAMP_ORDER: 'تاريخ تحديث السيناريو يسبق تاريخ إنشائه.', DUPLICATE_ENTRY: 'لا يمكن تكرار السؤال نفسه.',
    TOO_MANY_ENTRIES: 'الحد الأقصى هو 100 سيناريو.', BACKUP_TOO_LARGE: 'ملف المكتبة أكبر من الحد المسموح.',
    PERSIST_FAILED: 'تعذر حفظ المكتبة على هذا الجهاز.', NOT_FOUND: 'لم يعد السيناريو موجودًا.',
  };
  return messages[code] || 'تعذر إتمام العملية بأمان.';
}

function entitlementMessage(state) {
  if (state?.active) return 'المكتبة الشخصية مفعّلة لاشتراكك الموثق.';
  if (state?.status === 'checking') return 'نتحقق من اشتراكك الموثق…';
  if (state?.status === 'inactive') return 'اشتراك برو غير نشط أو منتهٍ؛ تبقى المكتبة الشخصية مقفلة.';
  return 'ميزة برو مقفلة: يلزم إعداد شراء داخل التطبيق وربط استحقاق خادمي موثق قبل إتاحتها.';
}

function setPersonalLibraryNotice(message, isError = false) {
  const notice = $('personal-library-notice');
  if (!notice) return;
  notice.textContent = message;
  notice.dataset.error = String(isError);
}

function updatePersonalLibraryGate(state = Companion.entitlement?.getState?.()) {
  const enabled = Boolean(state?.active && Companion.personalLibrary);
  const body = $('personal-library-body');
  const gate = $('personal-library-gate');
  const stateLabel = $('personal-library-state');
  if (body) body.hidden = !enabled;
  if (gate) gate.hidden = enabled;
  if (stateLabel) stateLabel.textContent = enabled ? 'برو مفعّل' : 'برو مقفل';
  document.querySelectorAll?.('[data-personal-library-control]').forEach(control => { control.disabled = !enabled; });
  setPersonalLibraryNotice(entitlementMessage(state), !enabled);
}

function renderPersonalLibrary() {
  const list = $('personal-library-list');
  const count = $('personal-library-count');
  if (!list || !Companion.personalLibrary) return;
  const entries = Companion.personalLibrary.list();
  list.replaceChildren();
  if (count) count.textContent = `${entries.length}/100`;
  if (!entries.length) {
    const empty = document.createElement('p');
    empty.className = 'personal-library-empty';
    empty.textContent = 'ما كاين حتى سيناريو بعد. أضف سؤالًا وجوابه ليُجاب محليًا عند التطابق.';
    list.appendChild(empty);
    return;
  }
  entries.forEach(entry => {
    const item = document.createElement('article');
    item.className = 'personal-library-entry';
    const question = document.createElement('h4');
    question.textContent = entry.question;
    const answer = document.createElement('p');
    answer.textContent = entry.answer;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'personal-library-delete';
    remove.textContent = 'حذف';
    remove.addEventListener('click', () => deletePersonalLibraryEntry(entry.id, entry.question));
    item.append(question, answer, remove);
    list.appendChild(item);
  });
}

async function requirePersonalLibraryEntitlement() {
  if (!Companion.entitlement?.refresh) {
    updatePersonalLibraryGate();
    return false;
  }
  const state = await Companion.entitlement.refresh();
  updatePersonalLibraryGate(state);
  return Boolean(state.active && Companion.personalLibrary);
}

function closePersonalLibrary() {
  const panel = $('personal-library-panel');
  if (panel) panel.hidden = true;
  $('personal-library-open')?.focus();
}

async function openPersonalLibrary() {
  const panel = $('personal-library-panel');
  if (!panel) return;
  panel.hidden = false;
  updatePersonalLibraryGate({ status: 'checking', active: false });
  const allowed = await requirePersonalLibraryEntitlement();
  if (allowed) {
    const loadIssue = Companion.personalLibrary.getLoadIssue?.();
    setPersonalLibraryNotice(loadIssue ? `تعذر قراءة نسخة سابقة (${libraryErrorMessage(loadIssue)}). ابدأ بمكتبة جديدة أو استورد ملفًا صالحًا.` : entitlementMessage(Companion.entitlement.getState()), Boolean(loadIssue));
    renderPersonalLibrary();
  }
  $('personal-library-close')?.focus();
}

async function addPersonalLibraryEntry(event) {
  event.preventDefault();
  if (!await requirePersonalLibraryEntitlement()) return;
  const question = $('personal-library-question')?.value || '';
  const answer = $('personal-library-answer')?.value || '';
  const result = Companion.personalLibrary.add(question, answer);
  if (!result.ok) {
    setPersonalLibraryNotice(libraryErrorMessage(result.code), true);
    return;
  }
  $('personal-library-question').value = '';
  $('personal-library-answer').value = '';
  setPersonalLibraryNotice('تم حفظ السيناريو محليًا على هذا الجهاز.');
  renderPersonalLibrary();
}

async function deletePersonalLibraryEntry(id, question) {
  if (!await requirePersonalLibraryEntitlement()) return;
  if (!window.confirm(`حذف السيناريو «${question}»؟`)) return;
  const result = Companion.personalLibrary.remove(id);
  setPersonalLibraryNotice(result.ok ? 'تم حذف السيناريو من هذا الجهاز.' : libraryErrorMessage(result.code), !result.ok);
  if (result.ok) renderPersonalLibrary();
}

async function importPersonalLibrary(event) {
  const file = event.target?.files?.[0];
  event.target.value = '';
  if (!file || !await requirePersonalLibraryEntitlement()) return;
  if (file.size > 160_000) {
    setPersonalLibraryNotice(libraryErrorMessage('BACKUP_TOO_LARGE'), true);
    return;
  }
  try {
    const result = Companion.personalLibrary.importJson(await file.text());
    setPersonalLibraryNotice(result.ok ? `تم استيراد ${result.count} سيناريو محليًا.` : libraryErrorMessage(result.code), !result.ok);
    if (result.ok) renderPersonalLibrary();
  } catch {
    setPersonalLibraryNotice('تعذر قراءة ملف الاستيراد.', true);
  }
}

async function exportPersonalLibrary() {
  if (!await requirePersonalLibraryEntitlement()) return;
  const result = Companion.personalLibrary.exportJson();
  if (!result.ok) {
    setPersonalLibraryNotice(libraryErrorMessage(result.code), true);
    return;
  }
  const link = document.createElement('a');
  const url = URL.createObjectURL(new Blob([result.text], { type: 'application/json;charset=utf-8' }));
  link.href = url;
  link.download = 'sentinel-personal-library.json';
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  setPersonalLibraryNotice('تم تجهيز ملف JSON المُتحقق للتصدير.');
}

function nativeRecorder() {
  return window.Capacitor?.Plugins?.NativeAudioRecorder || null;
}

function nativeGeneratedAudio() {
  return window.Capacitor?.Plugins?.NativeGeneratedAudio || null;
}

function nativeTextToSpeech() {
  return window.Capacitor?.Plugins?.NativeTextToSpeech || null;
}

function nativeOfflineArabicVoice() {
  return window.Capacitor?.Plugins?.NativeOfflineArabicVoice || null;
}

function isSafeSentinelReply(reply) {
  if (typeof reply !== 'string' || !reply.trim()) return false;
  return /[\u0600-\u06FF]/.test(reply) && !/for more information|thank you for watching|subscribe|اشتركوا في القناة|https?:\/\/|www\.|sendaimedia|kenhu|comments section/i.test(reply);
}

function validateSentinelInput(text) {
  const checked = window.SentinelInputGuard?.check?.(text);
  if (checked) return checked;
  return /[\u0600-\u06FF]/.test(String(text || ''))
    ? { ok: true, reason: 'arabic' }
    : { ok: false, reason: 'not_arabic' };
}

function showRejectedInput(source) {
  const detail = source === 'voice' ? 'الاستماع التقط نصًا غير واضح أو خارجيًا.' : 'النص ما بانش كسؤال عربي أو دارجة.';
  appendChatMessage('system', `${detail} ما دخلناش للدردشة ولا للمكتبة. عاود قول أو كتب سؤالك بالدارجة.`);
  setKnowledgeStatus('تم حظر نص غير موثوق قبل المكتبة');
  setRobotState('idle', 'عاود قول سؤالك بالدارجة بوضوح.');
}

function nativeTransport() {
  return window.Capacitor?.Plugins?.NativeSentinelTransport || null;
}

function isNativeAndroid() {
  return window.Capacitor?.getPlatform?.() === 'android' || Boolean(window.Capacitor?.isNativePlatform?.());
}

async function ensureMicrophonePermission(recorder) {
  if (typeof recorder?.checkPermissions !== 'function' || typeof recorder?.requestPermissions !== 'function') return true;
  const current = await recorder.checkPermissions();
  if (current?.microphone === 'granted') return true;
  const requested = await recorder.requestPermissions({ permissions: ['microphone'] });
  return requested?.microphone === 'granted';
}

async function postSentinel(operation, json, signal) {
  const body = JSON.stringify({ 0: { json } });
  const transport = nativeTransport();
  const path = operation === 'transcribe' ? 'voice.sentinelTranscribe' : operation === 'speech' ? 'voice.sentinelSpeech' : 'ai.sentinelReply';
  const browserPost = async () => {
    const response = await fetch(`${CONFIG.apiBase}/api/trpc/${path}?batch=1`, {
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, signal, body,
    });
    return { status: response.status, payload: await response.json().catch(() => null) };
  };
  const nativePost = async () => {
    if (signal?.aborted) throw new DOMException('The request was stopped.', 'AbortError');
    let timeoutId;
    let removeAbort = () => {};
    try {
      const nativeResult = transport.post({ operation, body });
      const stopped = new Promise((_, reject) => {
        const onAbort = () => reject(new DOMException('The request was stopped.', 'AbortError'));
        signal?.addEventListener('abort', onAbort, { once: true });
        removeAbort = () => signal?.removeEventListener('abort', onAbort);
      });
      const timedOut = new Promise((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error('SERVER_TIMEOUT')), 30000); });
      const result = await Promise.race([nativeResult, stopped, timedOut]);
      return { status: Number(result?.status || 0), payload: JSON.parse(result?.body || 'null') };
    } finally {
      window.clearTimeout(timeoutId);
      removeAbort();
    }
  };
  if (operation === 'reply') {
    if (isNativeAndroid() && transport?.post) {
      let nativeTimeoutId;
      try {
        const nativeTimedOut = new Promise((_, reject) => { nativeTimeoutId = window.setTimeout(() => reject(new Error('NATIVE_REPLY_TIMEOUT')), NATIVE_REPLY_TIMEOUT_MS); });
        const nativeResult = await Promise.race([nativePost(), nativeTimedOut]);
        if (nativeResult.status >= 200 && nativeResult.status < 300) return nativeResult;
        throw new Error(`HTTP_${nativeResult.status}`);
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw error;
      } finally {
        window.clearTimeout(nativeTimeoutId);
      }
    }
    return browserPost();
  }
  if (isNativeAndroid() && transport?.post) return nativePost();
  return browserPost();
}

async function requestTranscription(recording, signal) {
  const { status, payload } = await postSentinel('transcribe', {
    audioBase64: recording.audioBase64, mimeType: recording.mimeType || 'audio/mp4', locale: Companion.locale,
  }, signal);
  const text = payload?.[0]?.result?.data?.json?.text;
  if (status < 200 || status >= 300 || typeof text !== 'string' || !text.trim()) throw new Error(payload?.[0]?.error?.json?.message || 'TRANSCRIPTION_FAILED');
  const cleaned = text.trim();
  if (!validateSentinelInput(cleaned).ok) throw new Error('UNTRUSTED_TRANSCRIPT');
  return cleaned;
}

async function requestReply(messages, signal) {
  const traceId = createTraceId();
  const latestMessage = [...messages].reverse().find(message => message.role === 'user')?.content || '';
  const personalReply = Companion.entitlement?.getState?.().active ? Companion.personalLibrary?.match(latestMessage) : null;
  if (personalReply?.answer) {
    const result = {
      reply: personalReply.answer, suggestions: [], plan: [], personalMatch: true,
      knowledge: { mode: 'personal-local', fresh: false, local: true, sources: ['مكتبتك الشخصية المحلية'] },
      traceId, model: 'sentinel-personal-library',
    };
    setKnowledgeStatus(`جواب من مكتبتك الشخصية · محلي فقط · TRACE ${traceId.slice(-6)}`);
    return result;
  }
  const localDirectReply = window.SentinelLocalLibrary?.direct?.(latestMessage);
  if (localDirectReply?.reply) {
    const result = {
      ...localDirectReply,
      knowledge: { mode: 'internal', fresh: false, local: true, sources: ['مكتبة Android الداخلية'] },
      traceId,
      model: 'sentinel-local-library',
    };
    setKnowledgeStatus(`جواب فوري · مكتبة Android الداخلية · TRACE ${traceId.slice(-6)}`);
    return result;
  }
  const localLibraryReply = window.SentinelLocalLibrary?.answer?.(latestMessage);
  if (localLibraryReply?.reply && localLibraryReply.localMatch) {
    const result = {
      ...localLibraryReply,
      knowledge: { mode: 'internal', fresh: false, local: true, sources: ['مكتبة Android الداخلية'] },
      traceId,
      model: 'sentinel-local-library',
    };
    setKnowledgeStatus(`جواب من المكتبة · نفس النص المنسوخ · TRACE ${traceId.slice(-6)}`);
    return result;
  }
  let failure = new Error('SENTINEL_REPLY_UNAVAILABLE');
  for (let attempt = 0; attempt < 1; attempt += 1) {
    try {
      let timeoutId;
      setKnowledgeStatus(`TRACE ${traceId.slice(-6)} · وصل الطلب للخادم…`);
      const replyRequest = postSentinel('reply', { messages, locale: Companion.locale, context: null, traceId }, signal);
      const timedOut = new Promise((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error('REPLY_TIMEOUT')), LOCAL_LIBRARY_DEADLINE_MS); });
      const { status, payload } = await Promise.race([replyRequest, timedOut]);
      window.clearTimeout(timeoutId);
      const answer = payload?.[0]?.result?.data?.json;
      if (status >= 200 && status < 300 && isSafeSentinelReply(answer?.reply)) {
        const result = { ...answer, reply: answer.reply.trim(), traceId: answer.traceId || traceId };
        setKnowledgeStatus(`${knowledgeLabel(result.knowledge)} · TRACE ${result.traceId.slice(-6)}`);
        return result;
      }
      failure = new Error(payload?.[0]?.error?.json?.message || `HTTP_${status}`);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      failure = error instanceof Error ? error : failure;
    }
  }
  failure.traceId = traceId;
  throw failure;
}

async function requestGeminiSpeech(text, signal) {
  const { status, payload } = await postSentinel('speech', { text: text.slice(0, 140), locale: Companion.locale }, signal);
  const audio = payload?.[0]?.result?.data?.json;
  if (status < 200 || status >= 300 || typeof audio?.audioBase64 !== 'string' || audio.mimeType !== 'audio/pcm') throw new Error(payload?.[0]?.error?.json?.message || 'GEMINI_SPEECH_FAILED');
  return audio;
}

async function speakReply(text, signal) {
  const player = nativeGeneratedAudio();
  if (!player?.play) throw new Error('AUDIO_PLAYER_UNAVAILABLE');
  setRobotState('thinking', 'Sentinel كيحضّر الصوت…');
  const audio = await requestGeminiSpeech(text, signal);
  const result = await player.play({ audioBase64: audio.audioBase64, sampleRate: audio.sampleRate || 24000 });
  if (!result?.started) throw new Error('AUDIO_NOT_STARTED');
  setRobotState('speaking', 'Sentinel كيهضر دابا');
  return new Promise(resolve => {
    Companion.speechResolve = resolve;
    window.clearTimeout(Companion.speechTimer);
    Companion.speechTimer = window.setTimeout(() => { Companion.speechResolve = null; resolve(true); }, Number(result.durationMs) || 1800);
  });
}

async function speakLocalArabic(text) {
  const voice = nativeOfflineArabicVoice();
  if (!voice?.speak) throw new Error('LOCAL_ARABIC_VOICE_UNAVAILABLE');
  setRobotState('thinking', 'Sentinel كيحضّر الصوت العربي المحلي…');
  setKnowledgeStatus('الجواب وصل · كيتم تشغيل الصوت العربي المحلي');
  const result = await voice.speak({ text: text.slice(0, 300) });
  if (!result?.started) throw new Error('LOCAL_ARABIC_VOICE_NOT_STARTED');
  setRobotState('speaking', 'Sentinel كيهضر بالصوت العربي المحلي');
  return new Promise(resolve => {
    Companion.speechResolve = resolve;
    window.clearTimeout(Companion.speechTimer);
    Companion.speechTimer = window.setTimeout(() => { Companion.speechResolve = null; resolve(true); }, Number(result.durationMs) || 1800);
  });
}

async function speakAndroidFallback(text) {
  const tts = nativeTextToSpeech();
  if (!tts?.speak) throw new Error('ANDROID_TTS_UNAVAILABLE');
  setRobotState('thinking', 'الصوت البديل كيحضّر نفس الجواب…');
  const result = await tts.speak({ text: text.slice(0, 280), locale: Companion.locale });
  if (!result?.started) throw new Error('ANDROID_TTS_NOT_STARTED');
  setRobotState('speaking', 'Sentinel كيهضر بالصوت المتاح فالهاتف');
  setKnowledgeStatus('الجواب وصل · الصوت البديل كينطق نفس الرد');
  return new Promise(resolve => {
    Companion.speechResolve = resolve;
    window.clearTimeout(Companion.speechTimer);
    Companion.speechTimer = window.setTimeout(() => { Companion.speechResolve = null; resolve(true); }, Number(result.estimatedDurationMs) || 1800);
  });
}

async function trySpeakReply(text, signal) {
  try {
    await speakLocalArabic(text);
    return true;
  } catch (localError) {
    if (localError?.name === 'AbortError') throw localError;
    try {
      setKnowledgeStatus('الصوت المحلي تعذر · نجرب صوت الخادم');
      await speakReply(text, signal);
      return true;
    } catch (cloudError) {
      if (cloudError?.name === 'AbortError') throw cloudError;
      try {
        await speakAndroidFallback(text);
        return true;
      } catch {
        appendChatMessage('system', 'الجواب مكتوب. فشل الصوت المحلي والخادمي، ومحرك العربية غير متاح فالهاتف دابا.');
        setKnowledgeStatus('فشل الصوت: محلي → خادم → محرك Android');
        setRobotState('idle', 'الجواب وصل. تقدر تكمل الدردشة أو تعاود تجرب الصوت.');
        return false;
      }
    }
  }
}

async function beginVoiceSession() {
  if (Companion.active || Companion.turnInProgress || Companion.controller) return;
  const recorder = nativeRecorder();
  if (!recorder || !CONFIG.apiBase) {
    setRobotState('error', 'مسار الصوت داخل التطبيق غير جاهز. أعد فتح النسخة الجديدة.');
    return;
  }
  try {
    if (!await ensureMicrophonePermission(recorder)) {
      setRobotState('error', 'لم يتم منح إذن الميكروفون لـ Sentinel.');
      return;
    }
    Companion.active = true;
    setVoiceControls(true);
    scheduleVoiceTurn(0);
  } catch (error) {
      setRobotState('error', 'تعذر تشغيل الصوت داخل التطبيق.');
  }
}

function scheduleVoiceTurn(delay = 350) {
  if (!Companion.active) return;
  window.clearTimeout(Companion.turnTimer);
  Companion.turnTimer = window.setTimeout(runVoiceTurn, delay);
}

async function runVoiceTurn() {
  const recorder = nativeRecorder();
  if (!Companion.active || !recorder || Companion.turnInProgress) return;
  Companion.turnInProgress = true;
  Companion.controller = new AbortController();
  try {
    setRobotState('listening', 'كنسمع ليك… هضر دابا');
    await recorder.startRecording();
    Companion.recording = true;
    await new Promise(resolve => {
      Companion.turnDelayResolve = resolve;
      Companion.turnTimer = window.setTimeout(() => {
        Companion.turnDelayResolve = null;
        resolve();
      }, TURN_DURATION_MS);
    });
    if (!Companion.active) return;
    setRobotState('thinking', 'كنفهم كلامك…');
    const recording = await recorder.stopRecording();
    Companion.recording = false;
    const text = await requestTranscription(recording, Companion.controller.signal);
    if (!Companion.active) return;
    setKnowledgeStatus(`سمعت: «${text.slice(0, 46)}» · كنربط المكتبة`);
    Companion.messages.push({ role: 'user', content: text });
    appendChatMessage('user', text);
    setRobotState('thinking', 'Sentinel كيفكّر…');
    const waitingMessage = appendChatMessage('system', 'Sentinel كيربط بالخادم وكيوجد الجواب…');
    const answer = await requestReply(Companion.messages.slice(-10), Companion.controller.signal);
    if (!Companion.active) return;
    removeChatMessage(waitingMessage);
    Companion.messages.push({ role: 'assistant', content: answer.reply });
    appendChatMessage('assistant', displayReply(answer));
    await trySpeakReply(answer.reply, Companion.controller.signal);
  } catch (error) {
    if (error?.name !== 'AbortError' && Companion.active) {
      const code = String(error?.message || '');
      const rejected = code === 'UNTRUSTED_TRANSCRIPT';
      const listeningIssue = rejected || /TRANSCRIPTION|AUDIO_EMPTY|AUDIO_TOO_SHORT|AUDIO_READ|MICROPHONE/.test(code);
      if (rejected) showRejectedInput('voice');
      else appendChatMessage('system', listeningIssue ? 'ما سمعتش كلام واضح. قرّب للهاتف وهضر 3 حتى 6 ثواني، ثم عاود اضغط الأخضر.' : 'تعذر وصول الجواب من الخادم. جرّب مرة أخرى.');
      if (!rejected) setKnowledgeStatus(listeningIssue ? 'الاستماع ما التقطش كلام واضح' : `ما وصلش الجواب · TRACE ${String(error?.traceId || 'غير متاح').slice(-6)}`);
      if (!rejected) setRobotState('error', listeningIssue ? 'ما سمعتش مزيان. عاود هضر بعد ما تضغط الأخضر.' : 'توقفت دورة الصوت. اضغط الأخضر للمحاولة من جديد.');
      Companion.active = false;
      setVoiceControls(false);
    }
  } finally {
    Companion.recording = false;
    Companion.turnInProgress = false;
    Companion.controller = null;
    if (Companion.active) {
      setRobotState('idle', 'كنسمع ليك من جديد…');
      scheduleVoiceTurn(480);
    }
  }
}

async function stopVoiceSession() {
  Companion.active = false;
  window.clearTimeout(Companion.turnTimer);
  window.clearTimeout(Companion.speechTimer);
  Companion.turnDelayResolve?.();
  Companion.turnDelayResolve = null;
  Companion.speechResolve?.(false);
  Companion.speechResolve = null;
  Companion.controller?.abort();
  Companion.controller = null;
  if (Companion.recording) {
    try { await nativeRecorder()?.stopRecording(); } catch { /* the recorder may already be stopped */ }
  }
  Companion.recording = false;
  nativeGeneratedAudio()?.stop?.().catch(() => {});
  nativeOfflineArabicVoice()?.stop?.().catch(() => {});
  nativeTextToSpeech()?.stop?.().catch(() => {});
  setChatBusy(false);
  setVoiceControls(false);
  setRobotState('idle', 'تم الإيقاف. تقدر تهضر أو تكتب للروبوت');
}

async function sendChatMessage(event) {
  event?.preventDefault();
  const input = $('chat-input');
  const text = input?.value.trim();
  if (!text || Companion.controller) return;
  if (Companion.active) await stopVoiceSession();
  if (!validateSentinelInput(text).ok) {
    showRejectedInput('typed');
    return;
  }
  input.value = '';
  Companion.messages.push({ role: 'user', content: text });
  appendChatMessage('user', text);
  setKnowledgeStatus(`سؤالك للمكتبة: «${text.slice(0, 46)}»`);
  const waitingMessage = appendChatMessage('system', 'Sentinel كيربط بالخادم وكيوجد الجواب…');
  setChatBusy(true);
  setRobotState('thinking', 'Sentinel كيفكّر فجوابك…');
  const controller = new AbortController();
  Companion.controller = controller;
  try {
    const answer = await requestReply(Companion.messages.slice(-10), controller.signal);
    if (controller.signal.aborted) return;
    removeChatMessage(waitingMessage);
    Companion.messages.push({ role: 'assistant', content: answer.reply });
    appendChatMessage('assistant', displayReply(answer));
    await trySpeakReply(answer.reply, controller.signal);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      if (waitingMessage) waitingMessage.textContent = 'ما قدرش Sentinel يكمل الجواب دابا. عاود من بعد لحظة.';
      setKnowledgeStatus(`ما وصلش الجواب · TRACE ${String(error?.traceId || 'غير متاح').slice(-6)}`);
      setRobotState('error', error?.message === 'REPLY_TIMEOUT' ? 'تأخر الرد. عاود من بعد لحظة.' : 'تعذر إكمال الجواب.');
    } else {
      removeChatMessage(waitingMessage);
    }
  } finally {
    if (Companion.controller === controller) Companion.controller = null;
    setChatBusy(false);
    if (!Companion.active) setRobotState('idle', 'تقدر تكتب أو تهضر مع Sentinel');
  }
}

function init() {
  setRobotState();
  setVoiceControls(false);
  setChatBusy(false);
  try {
    Companion.personalLibrary = window.SentinelPersonalLibrary?.createStore?.() || null;
  } catch {
    Companion.personalLibrary = null;
  }
  const buildMarker = $('build-marker');
  if (buildMarker) buildMarker.textContent = `BUILD ${BUILD_ID}`;
  setKnowledgeStatus(`جاهز · BUILD ${BUILD_ID}`);
  $('voice-start')?.addEventListener('click', beginVoiceSession);
  $('voice-stop')?.addEventListener('click', stopVoiceSession);
  $('chat-form')?.addEventListener('submit', sendChatMessage);
  $('chat-abort')?.addEventListener('click', stopVoiceSession);
  $('personal-library-open')?.addEventListener('click', openPersonalLibrary);
  $('personal-library-close')?.addEventListener('click', closePersonalLibrary);
  $('personal-library-form')?.addEventListener('submit', addPersonalLibraryEntry);
  $('personal-library-import')?.addEventListener('change', importPersonalLibrary);
  $('personal-library-export')?.addEventListener('click', exportPersonalLibrary);
  Companion.entitlement?.subscribe?.(updatePersonalLibraryGate);
  updatePersonalLibraryGate();
  Companion.entitlement?.refresh?.().then(updatePersonalLibraryGate).catch(() => updatePersonalLibraryGate());
}

document.addEventListener('DOMContentLoaded', init);

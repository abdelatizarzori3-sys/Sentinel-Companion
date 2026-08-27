const CONFIG = {
  apiBase: (window.SENTINEL_API_BASE || localStorage.getItem('sentinel_api_base') || 'https://marokecho-jrrh7cuh.manus.space').replace(/\/$/, ''),
};

const Companion = {
  locale: 'ar-MA', messages: [], controller: null, active: false, recording: false,
  turnTimer: null, turnDelayResolve: null, speechTimer: null, speechResolve: null, turnInProgress: false,
};

const TURN_DURATION_MS = 4800;
const $ = id => document.getElementById(id);

function setRobotState(state = 'idle', label = 'اضغط النقطة الخضراء وتكلّم') {
  const stage = $('robot-stage');
  const caption = $('robot-state-label');
  if (stage) stage.dataset.state = state;
  if (caption) caption.textContent = label;
}

function setVoiceControls(active) {
  const start = $('voice-start');
  const stop = $('voice-stop');
  if (start) { start.disabled = active; start.dataset.active = String(active); }
  if (stop) stop.disabled = !active;
}

function nativeRecorder() {
  return window.Capacitor?.Plugins?.NativeAudioRecorder || null;
}

function nativeTts() {
  return window.Capacitor?.Plugins?.NativeTextToSpeech || null;
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

async function requestTranscription(recording, signal) {
  const { status, payload } = await postSentinel('transcribe', {
    audioBase64: recording.audioBase64, mimeType: recording.mimeType || 'audio/mp4', locale: Companion.locale,
  }, signal);
  const text = payload?.[0]?.result?.data?.json?.text;
  if (status < 200 || status >= 300 || typeof text !== 'string' || !text.trim()) throw new Error(payload?.[0]?.error?.json?.message || 'TRANSCRIPTION_FAILED');
  return text.trim();
}

async function requestReply(messages, signal) {
  let failure = new Error('SENTINEL_REPLY_UNAVAILABLE');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { status, payload } = await postSentinel('reply', { messages, locale: Companion.locale, context: null }, signal);
      const reply = payload?.[0]?.result?.data?.json?.reply;
      if (status >= 200 && status < 300 && typeof reply === 'string' && reply.trim()) return reply.trim();
      failure = new Error(payload?.[0]?.error?.json?.message || `HTTP_${status}`);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      failure = error instanceof Error ? error : failure;
    }
    if (attempt === 0) await new Promise(resolve => window.setTimeout(resolve, 350));
  }
  throw failure;
}

async function ensureArabicVoice() {
  const tts = nativeTts();
  if (!tts?.checkStatus) throw new Error('TTS_UNAVAILABLE');
  const status = await tts.checkStatus({ locale: Companion.locale });
  if (!status?.ready || !status.requestedLanguageAvailable) throw new Error('TTS_LANGUAGE_UNAVAILABLE');
}

function speakReply(text) {
  const tts = nativeTts();
  if (!tts?.speak) return Promise.reject(new Error('TTS_UNAVAILABLE'));
  setRobotState('speaking', 'Sentinel كيهضر دابا');
  return tts.speak({ text, locale: Companion.locale }).then(result => new Promise((resolve, reject) => {
    if (!result?.started) { reject(new Error('TTS_NOT_STARTED')); return; }
    Companion.speechResolve = resolve;
    window.clearTimeout(Companion.speechTimer);
    Companion.speechTimer = window.setTimeout(() => {
      Companion.speechResolve = null;
      resolve(true);
    }, Number(result.estimatedDurationMs) || 1800);
  }));
}

async function beginVoiceSession() {
  if (Companion.active || Companion.turnInProgress) return;
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
    await ensureArabicVoice();
    Companion.active = true;
    setVoiceControls(true);
    scheduleVoiceTurn(0);
  } catch (error) {
    const missingArabic = String(error?.message || error).includes('LANGUAGE');
    setRobotState('error', missingArabic ? 'صوت العربية غير متاح داخل Sentinel الآن.' : 'تعذر تشغيل الصوت داخل التطبيق.');
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
    Companion.messages.push({ role: 'user', content: text });
    setRobotState('thinking', 'Sentinel كيفكّر…');
    const reply = await requestReply(Companion.messages.slice(-10), Companion.controller.signal);
    if (!Companion.active) return;
    Companion.messages.push({ role: 'assistant', content: reply });
    await speakReply(reply);
  } catch (error) {
    if (error?.name !== 'AbortError' && Companion.active) {
      const reason = String(error?.message || error);
      const missingArabic = reason.includes('LANGUAGE');
      setRobotState('error', missingArabic ? 'لم يبدأ صوت العربية داخل التطبيق.' : 'توقفت دورة الصوت. اضغط الأخضر للمحاولة من جديد.');
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
  nativeTts()?.stop?.().catch(() => {});
  setVoiceControls(false);
  setRobotState('idle', 'تم الإيقاف. اضغط النقطة الخضراء للحديث');
}

function init() {
  setRobotState();
  setVoiceControls(false);
  $('voice-start')?.addEventListener('click', beginVoiceSession);
  $('voice-stop')?.addEventListener('click', stopVoiceSession);
}

document.addEventListener('DOMContentLoaded', init);

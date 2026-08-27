const CONFIG = {
  apiBase: (window.SENTINEL_API_BASE || localStorage.getItem('sentinel_api_base') || 'https://marokecho-jrrh7cuh.manus.space').replace(/\/$/, ''),
};

const Companion = {
  locale: 'ar-MA', messages: [], controller: null, active: false, recording: false,
  turnTimer: null, turnDelayResolve: null, speechTimer: null, speechResolve: null, turnInProgress: false,
};

const TURN_DURATION_MS = 4800;
const REPLY_TIMEOUT_MS = 12000;
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

function nativeRecorder() {
  return window.Capacitor?.Plugins?.NativeAudioRecorder || null;
}

function nativeGeneratedAudio() {
  return window.Capacitor?.Plugins?.NativeGeneratedAudio || null;
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
    try {
      const browserResult = await browserPost();
      if (browserResult.status >= 200 && browserResult.status < 300) return browserResult;
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
    }
    if (isNativeAndroid() && transport?.post) return nativePost();
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
  return text.trim();
}

async function requestReply(messages, signal) {
  let failure = new Error('SENTINEL_REPLY_UNAVAILABLE');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      let timeoutId;
      const replyRequest = postSentinel('reply', { messages, locale: Companion.locale, context: null }, signal);
      const timedOut = new Promise((_, reject) => { timeoutId = window.setTimeout(() => reject(new Error('REPLY_TIMEOUT')), REPLY_TIMEOUT_MS); });
      const { status, payload } = await Promise.race([replyRequest, timedOut]);
      window.clearTimeout(timeoutId);
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
    Companion.messages.push({ role: 'user', content: text });
    appendChatMessage('user', text);
    setRobotState('thinking', 'Sentinel كيفكّر…');
    const reply = await requestReply(Companion.messages.slice(-10), Companion.controller.signal);
    if (!Companion.active) return;
    Companion.messages.push({ role: 'assistant', content: reply });
    appendChatMessage('assistant', reply);
    await speakReply(reply, Companion.controller.signal);
  } catch (error) {
    if (error?.name !== 'AbortError' && Companion.active) {
      const reason = String(error?.message || error);
      setRobotState('error', 'توقفت دورة الصوت. اضغط الأخضر للمحاولة من جديد.');
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
  input.value = '';
  Companion.messages.push({ role: 'user', content: text });
  appendChatMessage('user', text);
  const waitingMessage = appendChatMessage('system', 'Sentinel كييكتب جوابك…');
  setChatBusy(true);
  setRobotState('thinking', 'Sentinel كيفكّر فجوابك…');
  const controller = new AbortController();
  Companion.controller = controller;
  try {
    const reply = await requestReply(Companion.messages.slice(-10), controller.signal);
    if (controller.signal.aborted) return;
    removeChatMessage(waitingMessage);
    Companion.messages.push({ role: 'assistant', content: reply });
    appendChatMessage('assistant', reply);
    await speakReply(reply, controller.signal);
  } catch (error) {
    if (error?.name !== 'AbortError') {
      if (waitingMessage) waitingMessage.textContent = 'ما قدرش Sentinel يكمل الجواب دابا. عاود من بعد لحظة.';
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
  $('voice-start')?.addEventListener('click', beginVoiceSession);
  $('voice-stop')?.addEventListener('click', stopVoiceSession);
  $('chat-form')?.addEventListener('submit', sendChatMessage);
  $('chat-abort')?.addEventListener('click', stopVoiceSession);
}

document.addEventListener('DOMContentLoaded', init);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const app = readFileSync(resolve(root, 'mobile-web/app.js'), 'utf8');
const activity = readFileSync(resolve(root, 'android/app/src/main/java/com/abdelatizarzori/sentinel/MainActivity.java'), 'utf8');
const recorder = readFileSync(resolve(root, 'android/app/src/main/java/com/abdelatizarzori/sentinel/NativeAudioRecorderPlugin.java'), 'utf8');
const tts = readFileSync(resolve(root, 'android/app/src/main/java/com/abdelatizarzori/sentinel/NativeTextToSpeechPlugin.java'), 'utf8');

test('Sentinel uses native recording, server transcription, and spoken replies on Android', () => {
  assert.match(activity, /registerPlugin\(NativeAudioRecorderPlugin\.class\)/);
  assert.match(activity, /registerPlugin\(NativeTextToSpeechPlugin\.class\)/);
  assert.match(recorder, /name = "NativeAudioRecorder"/);
  assert.match(recorder, /audio\/mp4/);
  assert.match(app, /voice\.sentinelTranscribe/);
  assert.match(app, /function toggleRecordedConversation/);
  assert.match(app, /await sendMessage\(\)/);
  assert.match(app, /voiceEnabled: true/);
  assert.match(app, /NativeTextToSpeech/);
  assert.match(tts, /TextToSpeech/);
});

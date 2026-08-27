import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const html = readFileSync(resolve(root, 'mobile-web/index.html'), 'utf8');
const script = readFileSync(resolve(root, 'mobile-web/app.js'), 'utf8');

test('Sentinel neon interface preserves the 3D robot, live state and essential controls', () => {
  assert.match(html, /sentinel-neon-3d-robot_04ad6455\.png/);
  assert.match(html, /id="robot-stage"/);
  assert.match(html, /lip-sync/);
  assert.match(html, /voice-pipeline/);
  assert.match(html, /id="listen-toggle"/);
  assert.match(html, /id="call-toggle"/);
  assert.match(html, /id="call-status"/);
  assert.match(html, /id="tts-settings"/);
  assert.match(html, /id="microphone-settings"/);
  assert.match(html, /id="companion-input"/);
  assert.match(html, /prefers-reduced-motion/);
  assert.match(script, /function setRobotState/);
  assert.match(script, /function setVoiceStage/);
  assert.match(script, /setRobotState\('listening'/);
  assert.match(script, /setRobotState\('thinking'/);
  assert.match(script, /setRobotState\('speaking'/);
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const source = readFileSync(resolve(import.meta.dirname, '../mobile-web/sentinel-input-guard.js'), 'utf8');

test('Sentinel blocks ad-like or English-only speech before it becomes a chat message', () => {
  const sandbox = { window: {} };
  Function('window', source)(sandbox.window);
  const guard = sandbox.window.SentinelInputGuard;
  assert.deepEqual(guard.check('مرحبا Sentinel'), { ok: true, reason: 'arabic' });
  assert.deepEqual(guard.check('For more information, visit www.sendaimedia.com'), { ok: false, reason: 'external' });
  assert.deepEqual(guard.check('It sounds like when they order bogey.'), { ok: false, reason: 'not_arabic' });
  assert.deepEqual(guard.check('اشتركوا في القناة'), { ok: false, reason: 'external' });
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'mobile-web/sentinel-library.js'), 'utf8');

test('Sentinel local library is bundled and answers greetings without a network request', () => {
  const sandbox = { window: {} };
  Function('window', source)(sandbox.window);
  const library = sandbox.window.SentinelLocalLibrary;

  assert.equal(library.version, 'LOCAL-LIB-28');
  assert.equal(library.topicCount, 28);
  assert.match(library.direct('مرحبا').reply, /مرحبا/);
  assert.match(library.direct('كيف حالك').reply, /نظام ذكاء اصطناعي/);
  assert.match(library.direct('لا كثير').reply, /فاهمك/);
  assert.match(library.direct('كتفهم الدارجة').reply, /الدارجة المغربية/);
  assert.match(library.direct('ماهي مهاراتك').reply, /المهارات/);
  assert.match(library.direct('من طورك').reply, /Sentinel/);
  assert.match(library.direct('عندي مشكل الكلام').reply, /المشكل/);
  assert.match(library.direct('Thank you for watching').reply, /محتوى خارجي/);
  assert.equal(library.answer('بغيت نصلح مشكل فالتطبيق').localMatch, true);
  assert.equal(library.answer('كلام بلا موضوع').localMatch, false);
  assert.equal(library.answer('كلام بلا موضوع').needsServer, true);
  assert.equal(library.answer('كلام بلا موضوع').reply, '');
  assert.match(library.answer('مرحبا').reply, /مرحبا/);
  assert.match(library.answer('بغيت نصلح مشكل فالتطبيق').reply, /المشكل/);
  assert.doesNotMatch(library.answer('مرحبا').reply, /قناة|اشتراك|فيديو/i);
});

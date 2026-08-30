const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const appSource = fs.readFileSync('./app.js', 'utf8');
const serverSource = fs.readFileSync('./server.mjs', 'utf8');

test('Sentinel current interface exposes the active conversation contract', () => {
  assert.match(appSource, /async function sendMessage\(\)/);
  assert.match(appSource, /function toggleListening\(\)/);
  assert.match(appSource, /function speak\(text\)/);
  assert.match(appSource, /sentinelReply/);
  assert.match(appSource, /لم تُعرض إجابة تجريبية/);
  assert.doesNotMatch(appSource, /translatePythonSource/);
});

test('Sentinel translation endpoint remains server-owned', () => {
  assert.match(serverSource, /\/api\/translate/);
  assert.match(serverSource, /body\.direction === 'ar-en'/);
  assert.match(serverSource, /Preserve every keyword, identifier, indentation, quote, escape, placeholder, and f-string expression exactly/);
  assert.match(serverSource, /return json\(res, 200, \{ code: translated, mode: 'llm' \}\)/);
});

console.log('Sentinel current interface and translation contract: OK');

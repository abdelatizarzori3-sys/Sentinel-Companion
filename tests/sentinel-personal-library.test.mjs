import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, 'mobile-web/sentinel-personal-library.js'), 'utf8');

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    dump: key => values.get(key),
  };
}

function makeLibrary(storage = makeStorage()) {
  const sandbox = { window: { crypto: { randomUUID: () => '1234567890abcdef1234567890abcdef' }, localStorage: storage } };
  Function('window', source)(sandbox.window);
  let tick = 0;
  const library = sandbox.window.SentinelPersonalLibrary.createStore({
    storage,
    idFactory: () => `scenario_test${++tick}abcdefgh`,
    now: () => `2026-10-31T08:3${tick}:00.000Z`,
  });
  return { library, storage, api: sandbox.window.SentinelPersonalLibrary };
}

test('personal library saves Arabic Q&A locally and matches normalized questions', () => {
  const { library, storage, api } = makeLibrary();
  const added = library.add('كيف أُجهّز للامتحان؟', 'راجع الدروس المهمة، ثم حل تمرينًا واحدًا كل يوم.');

  assert.equal(added.ok, true);
  assert.equal(library.list().length, 1);
  assert.match(library.match('كيف اجهز للامتحان؟').answer, /راجع الدروس/);
  const exported = library.exportJson();
  assert.equal(exported.ok, true);
  assert.deepEqual(JSON.parse(exported.text), {
    schemaVersion: 1,
    entries: library.list(),
  });
  assert.equal(api.validateBackup(JSON.parse(storage.dump(api.storageKey))).ok, true);
});

test('personal library rejects unsafe text, duplicates, and keeps existing entries on invalid import', () => {
  const { library } = makeLibrary();
  assert.equal(library.add('كيف أنظم وقتي؟', 'ابدأ بمهمة واحدة مهمة لمدة عشرين دقيقة.').ok, true);
  assert.equal(library.add('كيف أنظم وقتي؟', 'جواب عربي مختلف لكنه مكرر السؤال.').code, 'DUPLICATE_ENTRY');
  assert.equal(library.add('سؤال عربي مناسب', 'شاهد https://private.example/file').code, 'INVALID_ANSWER');

  const before = library.exportJson().text;
  const invalid = JSON.stringify({ schemaVersion: 1, entries: [{ extra: true }] });
  assert.equal(library.importJson(invalid).ok, false);
  assert.equal(library.exportJson().text, before);
});

test('personal library imports only the exact validated schema', () => {
  const { library } = makeLibrary();
  const backup = {
    schemaVersion: 1,
    entries: [{
      id: 'scenario_importabcdefgh',
      question: 'كيف أبدأ مشروعًا صغيرًا؟',
      answer: 'حدد مشكلة واحدة واختبر عرضًا بسيطًا قبل التوسع.',
      createdAt: '2026-10-31T08:30:00.000Z',
      updatedAt: '2026-10-31T08:30:00.000Z',
    }],
  };
  const imported = library.importJson(JSON.stringify(backup));

  assert.deepEqual(imported, { ok: true, count: 1 });
  assert.equal(library.match('كيف ابدا مشروعا صغيرا؟').id, 'scenario_importabcdefgh');
  assert.equal(library.importJson(JSON.stringify({ ...backup, anotherField: true })).code, 'UNEXPECTED_BACKUP_FIELD');
});

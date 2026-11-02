/* Sentinel Personal Library: local text scenarios only; it never stores or decides entitlement. */
window.SentinelPersonalLibrary = (() => {
  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = 'sentinel_personal_library_v1';
  const MAX_ENTRIES = 100;
  const MAX_QUESTION_LENGTH = 280;
  const MAX_ANSWER_LENGTH = 1600;
  const MAX_BACKUP_BYTES = 160_000;
  const ARABIC_PATTERN = /[\u0600-\u06FF]/;
  const UNSAFE_CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
  const SENSITIVE_OR_LINK_PATTERN = /(?:https?:\/\/|www\.|file:\/\/|content:\/\/|data:|-----BEGIN|\b(?:api[_-]?key|secret|token|password|passwd|authorization)\b\s*[:=]|\bsk-[A-Za-z0-9_-]{12,})/i;
  const ID_PATTERN = /^[A-Za-z0-9_-]{8,96}$/;
  const ENTRY_KEYS = ['id', 'question', 'answer', 'createdAt', 'updatedAt'];

  function fail(code) {
    return { ok: false, code };
  }

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[إأآ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/[ًٌٍَُِّْـ]/g, '')
      .replace(/[؟?!،,.؛:]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isUtcTimestamp(value) {
    if (typeof value !== 'string' || !value.endsWith('Z')) return false;
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
  }

  function isSafeText(value, maximum) {
    return typeof value === 'string'
      && value === value.trim()
      && value.length >= 3
      && value.length <= maximum
      && ARABIC_PATTERN.test(value)
      && !UNSAFE_CONTROL_PATTERN.test(value)
      && !SENSITIVE_OR_LINK_PATTERN.test(value);
  }

  function validateEntry(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return fail('INVALID_ENTRY');
    const keys = Object.keys(entry).sort();
    if (keys.length !== ENTRY_KEYS.length || keys.some((key, index) => key !== ENTRY_KEYS.slice().sort()[index])) return fail('UNEXPECTED_ENTRY_FIELD');
    if (typeof entry.id !== 'string' || !ID_PATTERN.test(entry.id)) return fail('INVALID_ID');
    if (!isSafeText(entry.question, MAX_QUESTION_LENGTH)) return fail('INVALID_QUESTION');
    if (!isSafeText(entry.answer, MAX_ANSWER_LENGTH)) return fail('INVALID_ANSWER');
    if (!isUtcTimestamp(entry.createdAt) || !isUtcTimestamp(entry.updatedAt)) return fail('INVALID_TIMESTAMP');
    if (Date.parse(entry.updatedAt) < Date.parse(entry.createdAt)) return fail('INVALID_TIMESTAMP_ORDER');
    return { ok: true, value: Object.freeze({ ...entry }) };
  }

  function validateBackup(candidate) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return fail('INVALID_BACKUP');
    const keys = Object.keys(candidate).sort();
    if (keys.length !== 2 || keys[0] !== 'entries' || keys[1] !== 'schemaVersion') return fail('UNEXPECTED_BACKUP_FIELD');
    if (candidate.schemaVersion !== SCHEMA_VERSION || !Array.isArray(candidate.entries)) return fail('INVALID_BACKUP');
    if (candidate.entries.length > MAX_ENTRIES) return fail('TOO_MANY_ENTRIES');

    const ids = new Set();
    const questions = new Set();
    const entries = [];
    for (const candidateEntry of candidate.entries) {
      const checked = validateEntry(candidateEntry);
      if (!checked.ok) return checked;
      const questionKey = normalize(checked.value.question);
      if (!questionKey || ids.has(checked.value.id) || questions.has(questionKey)) return fail('DUPLICATE_ENTRY');
      ids.add(checked.value.id);
      questions.add(questionKey);
      entries.push(checked.value);
    }
    return { ok: true, value: { schemaVersion: SCHEMA_VERSION, entries } };
  }

  function createId() {
    const random = window.crypto?.randomUUID?.().replace(/-/g, '')
      || `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    return `scenario_${random}`.slice(0, 96);
  }

  function createStore(options = {}) {
    const storage = options.storage || window.localStorage;
    const now = options.now || (() => new Date().toISOString());
    const idFactory = options.idFactory || createId;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') throw new Error('PERSONAL_LIBRARY_STORAGE_UNAVAILABLE');

    let entries = [];
    let loadIssue = null;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        if (raw.length > MAX_BACKUP_BYTES) throw new Error('BACKUP_TOO_LARGE');
        const checked = validateBackup(JSON.parse(raw));
        if (!checked.ok) throw new Error(checked.code);
        entries = checked.value.entries;
      }
    } catch (error) {
      loadIssue = error?.message || 'INVALID_SAVED_LIBRARY';
    }

    function snapshot() {
      return { schemaVersion: SCHEMA_VERSION, entries: entries.map(entry => ({ ...entry })) };
    }

    function persist(nextEntries) {
      const backup = { schemaVersion: SCHEMA_VERSION, entries: nextEntries };
      const encoded = JSON.stringify(backup);
      if (encoded.length > MAX_BACKUP_BYTES) throw new Error('BACKUP_TOO_LARGE');
      storage.setItem(STORAGE_KEY, encoded);
      entries = nextEntries;
    }

    function list() {
      return entries.map(entry => ({ ...entry }));
    }

    function add(questionInput, answerInput) {
      const question = typeof questionInput === 'string' ? questionInput.trim() : '';
      const answer = typeof answerInput === 'string' ? answerInput.trim() : '';
      if (entries.length >= MAX_ENTRIES) return fail('TOO_MANY_ENTRIES');
      if (!isSafeText(question, MAX_QUESTION_LENGTH)) return fail('INVALID_QUESTION');
      if (!isSafeText(answer, MAX_ANSWER_LENGTH)) return fail('INVALID_ANSWER');
      const questionKey = normalize(question);
      if (entries.some(entry => normalize(entry.question) === questionKey)) return fail('DUPLICATE_ENTRY');

      const timestamp = now();
      const id = idFactory();
      if (entries.some(entry => entry.id === id)) return fail('DUPLICATE_ENTRY');
      const entry = { id, question, answer, createdAt: timestamp, updatedAt: timestamp };
      const checked = validateEntry(entry);
      if (!checked.ok) return checked;
      try {
        persist([...entries, checked.value]);
        return { ok: true, value: { ...checked.value } };
      } catch (error) {
        return fail(error?.message === 'BACKUP_TOO_LARGE' ? 'BACKUP_TOO_LARGE' : 'PERSIST_FAILED');
      }
    }

    function remove(id) {
      if (typeof id !== 'string') return fail('INVALID_ID');
      const nextEntries = entries.filter(entry => entry.id !== id);
      if (nextEntries.length === entries.length) return fail('NOT_FOUND');
      try {
        persist(nextEntries);
        return { ok: true };
      } catch {
        return fail('PERSIST_FAILED');
      }
    }

    function importJson(text) {
      if (typeof text !== 'string' || !text.trim()) return fail('INVALID_BACKUP');
      if (text.length > MAX_BACKUP_BYTES) return fail('BACKUP_TOO_LARGE');
      let candidate;
      try {
        candidate = JSON.parse(text);
      } catch {
        return fail('INVALID_JSON');
      }
      const checked = validateBackup(candidate);
      if (!checked.ok) return checked;
      try {
        persist(checked.value.entries);
        loadIssue = null;
        return { ok: true, count: entries.length };
      } catch {
        return fail('PERSIST_FAILED');
      }
    }

    function exportJson() {
      const checked = validateBackup(snapshot());
      if (!checked.ok) return fail(checked.code);
      return { ok: true, text: JSON.stringify(checked.value, null, 2) };
    }

    function match(question) {
      const key = normalize(question);
      if (!key) return null;
      const hit = entries.find(entry => normalize(entry.question) === key);
      return hit ? { ...hit } : null;
    }

    return Object.freeze({
      list,
      add,
      remove,
      importJson,
      exportJson,
      match,
      getLoadIssue: () => loadIssue,
      limits: Object.freeze({ maxEntries: MAX_ENTRIES, maxQuestionLength: MAX_QUESTION_LENGTH, maxAnswerLength: MAX_ANSWER_LENGTH }),
    });
  }

  return Object.freeze({
    createStore,
    validateBackup,
    normalize,
    schemaVersion: SCHEMA_VERSION,
    storageKey: STORAGE_KEY,
  });
})();

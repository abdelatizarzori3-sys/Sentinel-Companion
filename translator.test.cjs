const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('./app.js', 'utf8');
const sandbox = {
  console,
  document: { addEventListener() {}, getElementById() {} },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  window: {},
  AbortSignal: { timeout() { return undefined; } },
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(source, sandbox);

const input = `'''رسالة مرحبا\nللتوثيق'''\n\"\"\"نجاح\"\"\"\nname = 'العالم'\npath = r'بيانات/ملف'\nquoted = \"رسالة \\\"مرحبا\\\"\"\nraw_bytes = b'KEEP_IDENTIFIER'\ntext = f'مرحبا {name.upper()} { {name: name} }'\n# اختبار نجاح`;
const output = sandbox.translatePythonSource(input, 'ar-en');

assert.match(output, /'''message Hello\nللتوثيق'''/);
assert.match(output, /\"\"\"success\"\"\"/);
assert.match(output, /name = 'world'/);
assert.match(output, /path = r'data\/ملف'/);
assert.match(output, /raw_bytes = b'KEEP_IDENTIFIER'/);
assert.match(output, /text = f'Hello \{name\.upper\(\)\} \{ \{name: name\} \}'/);
assert.match(output, /# test success/);
assert.match(output, /name = 'world'/);
assert.match(output, /\{name\.upper\(\)\}/);
assert.match(output, /\{ \{name: name\} \}/);
console.log('translator edge cases: OK');

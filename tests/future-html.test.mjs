import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

for (const [file, id] of [['index.html', 'future-companion-interface'], ['mobile-web/index.html', 'future-prism-interface']]) {
  test(`${file}: future companion CSS has valid newline boundaries`, () => {
    const html = readFileSync(resolve(root, file), 'utf8');
    const style = html.match(new RegExp(`<style id="${id}">([\\s\\S]*?)<\\/style>`));
    assert.ok(style, 'The future companion stylesheet must exist');
    assert.ok(html.indexOf(style[0]) < html.indexOf('</head>'));
    assert.equal(style[1].includes('\\n'), false, 'Literal newline escapes invalidate CSS selectors');
    assert.match(style[1], /^\s*\/\* Future interface: personal companion prism \*\/\s+body\s*\{/);
    assert.match(style[1], /:focus-visible/);
    assert.match(style[1], /prefers-reduced-motion/);
    const before = html.slice(html.lastIndexOf('</style>', html.indexOf(style[0])) + '</style>'.length, html.indexOf(style[0]));
    const after = html.slice(html.indexOf(style[0]) + style[0].length, html.indexOf('</head>'));
    assert.equal(before.trim(), '', 'No escaped text may leak before the stylesheet');
    assert.equal(after.trim(), '', 'No escaped text may leak after the stylesheet');
  });
}

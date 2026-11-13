import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as parser from 'mdast-util-from-markdown';

const source = await readFile(new URL('../src/components/markdownFormatting.ts', import.meta.url), 'utf8');
const module = { exports: {}, require: name => {
  assert.equal(name, 'mdast-util-from-markdown');
  return parser;
} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, module);
const { formattingRegions, formattingAt, toggleFormatting } = module.exports;
const active = (text, anchor, focus = anchor) => Object.keys(formattingAt(formattingRegions(text), anchor, focus)).sort();
function toggle(text, anchor, focus, format) {
  const edit = toggleFormatting(text, anchor, focus, format);
  return { text: text.slice(0, edit.start) + edit.text + text.slice(edit.end), anchor: edit.selectionStart, focus: edit.selectionEnd };
}

test('cursor and selections detect nested emphasis, including underscores', () => {
  for (const text of ['***word***', '___word___', '**_word_**', '__*word*__']) {
    assert.deepEqual(active(text, 5), ['bold', 'italic']);
    assert.deepEqual(active(text, 7, 3), ['bold', 'italic']);
  }
  assert.deepEqual(active('**word** plain', 6), ['bold']);
  assert.deepEqual(active('**word** plain', 9), []);
  assert.deepEqual(active('**word** plain', 3, 12), []);
});

test('formatting inside code and escaped markers remains inactive', () => {
  for (const text of ['`**literal**`', '```md\n**literal**\n```', '    **literal**', '\\*\\*literal\\*\\*']) {
    assert.deepEqual(active(text, text.indexOf('literal') + 2), []);
  }
});

test('removing one nested format preserves the other and the cursor', () => {
  assert.deepEqual(toggle('***word***\n', 5, 5, 'bold'), { text: '*word*\n', anchor: 3, focus: 3 });
  assert.deepEqual(toggle('***word***\n', 5, 5, 'italic'), { text: '**word**\n', anchor: 4, focus: 4 });
  assert.deepEqual(toggle('__word__\n', 6, 3, 'bold'), { text: 'word\n', anchor: 4, focus: 1 });
  assert.deepEqual(toggle('**word**\n', 0, 8, 'bold'), { text: 'word\n', anchor: 0, focus: 4 });
});

test('heading, list and link removal retains the text and surrounding content', () => {
  for (const [text, format, expected] of [
    ['# word\nnext', 'heading1', 'word\nnext'],
    ['## word\nnext', 'heading2', 'word\nnext'],
    ['## word ##\nnext', 'heading2', 'word\nnext'],
    ['word\n====\nnext', 'heading1', 'word\nnext'],
    ['- word\n- next', 'list', 'word\n- next'],
    ['1. word\n2. next', 'list', 'word\n2. next'],
    ['- [x] word\n', 'list', 'word\n'],
    ['[**word**](https://example.com)\n', 'link', '**word**\n'],
    ['[word][ref]\n\n[ref]: https://example.com\n', 'link', 'word\n\n[ref]: https://example.com\n'],
  ]) {
    const offset = text.indexOf('word') + 2;
    assert.equal(toggle(text, offset, offset, format).text, expected);
  }
});

test('adding block formats affects existing lines without inserting blank lines', () => {
  assert.deepEqual(toggle('before\nword\nafter\n', 10, 10, 'heading2'), { text: 'before\n## word\nafter\n', anchor: 13, focus: 13 });
  assert.deepEqual(toggle('one\ntwo\nnext\n', 0, 8, 'list'), { text: '- one\n- two\nnext\n', anchor: 2, focus: 12 });
  assert.deepEqual(toggle('\n', 0, 0, 'heading2'), { text: '## \n', anchor: 3, focus: 3 });
  assert.deepEqual(toggle('## \n', 3, 3, 'heading2'), { text: '\n', anchor: 0, focus: 0 });
});

test('heading levels switch without stacking markers and preserve the cursor', () => {
  assert.deepEqual(toggle('word\n', 2, 2, 'heading1'), { text: '# word\n', anchor: 4, focus: 4 });
  assert.deepEqual(toggle('## word\n', 5, 5, 'heading1'), { text: '# word\n', anchor: 4, focus: 4 });
  assert.deepEqual(toggle('# word\n', 4, 4, 'heading2'), { text: '## word\n', anchor: 5, focus: 5 });
  assert.deepEqual(toggle('word\n====\n', 2, 2, 'heading2'), { text: '## word\n', anchor: 5, focus: 5 });
  assert.deepEqual(active('### word\n', 6), ['heading3']);
});

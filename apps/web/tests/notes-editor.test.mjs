import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import * as parser from 'mdast-util-from-markdown';

const formattingSource = await readFile(new URL('../src/components/markdownFormatting.ts', import.meta.url), 'utf8');
const formattingModule = { exports: {}, require: name => {
  assert.equal(name, 'mdast-util-from-markdown');
  return parser;
} };
vm.runInNewContext(ts.transpileModule(formattingSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, formattingModule);
const highlightSource = await readFile(new URL('../src/components/markdownHighlight.ts', import.meta.url), 'utf8');
const highlightModule = { exports: {}, require: name => {
  assert.equal(name, './markdownFormatting');
  return formattingModule.exports;
} };
vm.runInNewContext(ts.transpileModule(highlightSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, highlightModule);
const { highlightMarkdown } = highlightModule.exports;

test('source decoration retains Markdown exactly and mutes syntax rather than content', () => {
  const source = '# Heading\n**bold** and *italic* and ~~removed~~\n- [x] Done\n[Link](https://example.com)\n![Image](/api/saved-attachments/photo)\n`code`\n```js\n**literal**\n```\nUnfinished ** and <script>alert(1)</script>\n';
  const tokens = highlightMarkdown(source);
  assert.equal(tokens.map(token => token.text).join(''), source);
  for (const [text, style] of [['# ', 'syntax'], ['Heading\n', 'heading'], ['**', 'syntax'], ['bold', 'strong'], ['italic', 'emphasis'], ['removed', 'strike'], ['- [x] ', 'syntax'], ['Link', 'link'], ['https://example.com', 'syntax'], ['code', 'code'], ['**literal**\n', 'code']]) {
    assert.ok(tokens.some(token => token.text === text && token.style.split(' ').includes(style)), `${text} should be ${style}`);
  }
});

test('list decorations follow nested items and empty markers, while indented code stays literal', () => {
  const nested = highlightMarkdown('- Parent\n    + Nested\n');
  assert.equal(nested.filter(token => token.style.includes('list-marker')).length, 2);
  const empty = highlightMarkdown('- \n');
  assert.ok(empty.some(token => token.text === '- ' && token.style.includes('list-marker')));
  assert.ok(highlightMarkdown('    - Literal\n').every(token => token.style === 'code'));
});

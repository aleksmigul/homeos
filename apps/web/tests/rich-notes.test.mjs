import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/components/RichNotes.tsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;

// A DOM adapter for unit testing sanitizer mutations without a browser runtime.
class TextNode {
  constructor(data) { this.data = data; }
  remove() { if (this.parent) this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1); this.parent = null; }
  get outerHTML() { return this.data; }
}
class Element {
  constructor(tag, attrs = {}, children = []) {
    this.tagName = tag.toUpperCase(); this.attrs = { ...attrs }; this.childNodes = []; this.style = {};
    this.append(...children);
  }
  get attributes() { return Object.keys(this.attrs).map(name => ({ name })); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  setAttribute(name, value) { this.attrs[name] = value; }
  removeAttribute(name) { delete this.attrs[name]; }
  append(...children) {
    for (let child of children) {
      if (typeof child === 'string') child = new TextNode(child);
      if (child.parent) child.remove();
      if (typeof child === 'object') child.parent = this;
      this.childNodes.push(child);
    }
  }
  remove() { if (this.parent) this.parent.childNodes.splice(this.parent.childNodes.indexOf(this), 1); this.parent = null; }
  replaceWith(...children) {
    const parent = this.parent, index = parent.childNodes.indexOf(this);
    this.remove();
    parent.childNodes.splice(index, 0, ...children);
    for (const child of children) if (typeof child === 'object') child.parent = parent;
  }
  querySelectorAll() { return this.childNodes.flatMap(child => child instanceof Element ? [child, ...child.querySelectorAll()] : []); }
  get innerHTML() { return this.childNodes.map(child => typeof child === 'string' ? child : child.outerHTML).join(''); }
  get outerHTML() {
    const tag = this.tagName.toLowerCase();
    const attrs = Object.entries(this.attrs).map(([key, value]) => ` ${key}="${value}"`).join('');
    return `<${tag}${attrs}>${['img', 'br'].includes(tag) ? '' : `${this.innerHTML}</${tag}>`}`;
  }
}
function fixture(...elements) {
  const body = new Element('body', {}, elements);
  const context = { exports: {}, HTMLElement: Element, DOMParser: class { parseFromString() { return { body, createElement: tag => new Element(tag) }; } }, require() { return {}; } };
  vm.runInNewContext(code, context);
  return { ...context.exports, body };
}
for (const width of ['160', '320', '640', '960', '2400']) {
  test(`save and reopen preserve safe image width ${width}`, () => {
    const f = fixture(new Element('img', { src: '/api/saved-attachments/image', width, style: 'width:99999px', onerror: 'bad()' }));
    const saved = f.encodeNotes('input');
    assert.match(saved, new RegExp(`width="${width}"`));
    assert.doesNotMatch(saved, /style=|onerror=/);
    assert.match(f.notesHtml(saved), new RegExp(`width="${width}"`));
  });
}
for (const width of ['-1', '0', '2401', '100%', '320px', '1e3', 'Infinity']) {
  test(`sanitize rejects invalid image width ${width}`, () => {
    const f = fixture(new Element('img', { src: 'https://example.com/image.png', width }));
    assert.doesNotMatch(f.sanitizeNotes('input'), /width=/);
  });
}
test('styled clipboard text becomes persistent semantic formatting', () => {
  const span = new Element('span', { style: 'font-weight:700;font-style:italic' }, ['hello']);
  span.style = { fontWeight: '700', fontStyle: 'italic' };
  const f = fixture(new Element('p', {}, [span]));
  assert.equal(f.sanitizeNotes('input'), '<p><em><strong>hello</strong></em></p>');
});
test('unsafe image URLs remain rejected with a valid width', () => {
  const f = fixture(new Element('img', { src: 'javascript:bad()', width: '320' }));
  assert.equal(f.sanitizeNotes('input'), '');
});

test('code, tables, headings and strikethrough survive save and reopen', () => {
  const f = fixture(
    new Element('h4', {}, ['Details']),
    new Element('pre', {}, [new Element('code', { class: 'language-js', onclick: 'bad()' }, ['const x = 1;'])]),
    new Element('table', {}, [new Element('tbody', {}, [new Element('tr', {}, [new Element('td', { style: 'color:red' }, ['Cell'])])])]),
    new Element('del', {}, ['Removed'])
  );
  const saved = f.encodeNotes('input');
  assert.match(saved, /<pre><code>const x = 1;<\/code><\/pre>/);
  assert.match(saved, /<table><tbody><tr><td>Cell<\/td><\/tr><\/tbody><\/table>/);
  assert.match(saved, /<h4>Details<\/h4>/);
  assert.match(saved, /<del>Removed<\/del>/);
  assert.doesNotMatch(saved, /onclick|class=|style=/);
  assert.equal(f.notesHtml(saved), saved.replace('<!--homeos-rich-text-->', ''));
});

test('StackEdit stores its exact Markdown source and sanitized preview', () => {
  const f = fixture(new Element('p', {}, ['Preview']), new Element('script', {}, ['bad()']));
  const markdown = '# Heading\n\n![Photo](/api/saved-attachments/photo)';
  const saved = f.encodeStackEditNotes(markdown, '<p>Preview</p><script>bad()</script>');
  assert.equal(f.notesSource(saved), markdown);
  assert.equal(f.notesHtml(saved), '<p>Preview</p>');
  assert.doesNotMatch(saved, /bad\(\)/);
});
test('legacy Markdown and rich HTML remain editable without destructive migration', () => {
  const f = fixture(new Element('p', {}, ['Existing notes']));
  assert.equal(f.notesSource('# Existing notes'), '# Existing notes');
  assert.equal(f.notesSource('<!--homeos-rich-text--><p>Existing notes</p>'), '<p>Existing notes</p>');
  assert.equal(f.notesSource('<!--homeos-stackedit-->invalid'), '<!--homeos-stackedit-->invalid');
});

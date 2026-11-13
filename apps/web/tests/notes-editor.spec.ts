import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const url = '/tests/fixtures/notes-editor.html';
const source = (page: Page) => page.getByRole('textbox', { name: 'Markdown source' });
const editor = (page: Page) => page.getByRole('region', { name: 'Day notes editor' });
async function pasteMarkdown(page: Page, text: string) {
  await source(page).press('Control+a');
  await source(page).evaluate((el, text) => {
    const data = new DataTransfer();
    data.setData('text/plain', text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  }, text);
}
async function open(page: Page, value?: string) {
  await page.goto(url);
  if (value !== undefined) {
    await page.evaluate(v => localStorage.setItem('notes', v), value);
    await page.reload();
  }
  await expect(source(page)).toBeVisible();
}
async function save(page: Page) {
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(editor(page).getByRole('status')).toHaveText('Saved');
}
async function selectSource(page: Page, start: number, end = start) {
  await source(page).evaluate((element, [start, end]) => {
    (element as HTMLElement).focus();
    function point(offset: number): [Node, number] {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (offset <= node.textContent!.length) return [node, offset];
        offset -= node.textContent!.length;
      }
      throw new Error('Selection offset outside source');
    }
    const [anchor, anchorOffset] = point(start);
    const [focus, focusOffset] = point(end);
    document.getSelection()!.setBaseAndExtent(anchor, anchorOffset, focus, focusOffset);
  }, [start, end]);
}
const png = readFileSync(new URL('../public/apple-touch-icon.png', import.meta.url));
async function uploadMock(page: Page, delay = 0) {
  await page.route('**/api/share-attachments', async route => {
    await new Promise(resolve => setTimeout(resolve, delay));
    await route.fulfill({ json: { attachment: { url: '/api/saved-attachments/photo' } } });
  });
  await page.route('**/api/saved-attachments/photo', route => route.fulfill({ body: png, contentType: 'image/png' }));
}

test('notes are already editable, toolbar uses icons with tooltips, split toggles without losing text', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await expect(page.getByRole('button', { name: 'Edit notes' })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(source(page).locator('.md-syntax').first()).toHaveText('**');
  expect(await source(page).locator('.md-syntax').first().evaluate(el => getComputedStyle(el).color)).toBe('rgb(161, 167, 175)');
  const bold = page.getByRole('button', { name: 'Bold', exact: true });
  await expect(bold.locator('svg')).toHaveCount(1);
  await expect(bold).toHaveAttribute('title', /Bold/);
  await expect(bold).toHaveText('');
  await expect(page.getByRole('region', { name: 'Notes preview' })).toHaveCount(0);
  await pasteMarkdown(page, '# Day one\n\n**Museum** and *coffee*\n- Tickets');
  await page.getByRole('button', { name: 'Split view' }).click();
  await expect(page.getByRole('button', { name: 'Split view' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Notes preview' }).getByRole('heading', { name: 'Day one' })).toBeVisible();
  await page.getByRole('button', { name: 'Split view' }).click();
  await expect(page.getByRole('region', { name: 'Notes preview' })).toHaveCount(0);
  await source(page).press('Control+End');
  await source(page).press('Enter');
  await source(page).pressSequentially('Sunset');
  await source(page).press('Control+Shift+ArrowLeft');
  await bold.click();
  await expect(source(page)).toContainText('**Sunset**');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(source(page)).not.toContainText('**Sunset**');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(source(page)).toContainText('**Sunset**');
  await save(page);
  await page.reload();
  await expect(source(page)).toContainText('# Day one');
  expect(errors).toEqual([]);
});

test('legacy HTML tags are dropped while paragraphs and inline images survive', async ({ page }) => {
  await uploadMock(page);
  await open(page, '<!--homeos-rich-text--><h2>Paris</h2><p>Visit <strong>museum</strong></p><p><img src="/api/saved-attachments/photo"></p>');
  await expect(source(page)).toContainText('## Paris');
  await expect(source(page)).toContainText('Visit museum');
  await expect(source(page).getByRole('img')).toBeVisible();
  await expect(source(page)).not.toContainText('<p>');
  await save(page);
  expect(await page.evaluate(() => localStorage.getItem('notes'))).not.toContain('<');
});

test('failed autosave retains draft and retry saves it', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { (window as any).failSave = true; });
  await source(page).fill('Keep this draft');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save notes');
  await expect(source(page)).toContainText('Keep this draft');
  expect(await page.evaluate(() => (window as any).busy)).toBe(true);
  await page.evaluate(() => { (window as any).failSave = false; });
  await page.getByRole('button', { name: 'Retry save' }).click();
  await expect(editor(page).getByRole('status')).toHaveText('Saved');
  expect(await page.evaluate(() => (window as any).busy)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem('notes'))).toContain('Keep this draft');
});

test('image picker preserves concurrent typing, shows image while editing and preserves source after reload', async ({ page }) => {
  await uploadMock(page, 350);
  await open(page);
  await page.locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
  await source(page).fill('Typed during upload');
  await expect(source(page).getByRole('img')).toBeVisible();
  await expect.poll(() => source(page).getByRole('img').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(180);
  await expect(source(page)).toContainText('Typed during upload');
  await expect(page.getByRole('region', { name: 'Notes preview' })).toHaveCount(0);
  await source(page).press('Control+End');
  await source(page).press('Enter');
  await source(page).pressSequentially('After image');
  await save(page);
  const saved = await page.evaluate(() => localStorage.getItem('notes'));
  expect(saved).toContain('![Image](/api/saved-attachments/photo)');
  expect(saved).toContain('After image');
  expect(saved).not.toContain('<img');
  expect(saved).not.toContain('Image in notes');
  await page.reload();
  await expect(source(page).getByRole('img')).toBeVisible();
  expect(await source(page).textContent()).toBe(saved);
});

test('pasted and dropped images stay visible with split off and on; invalid images are rejected', async ({ page }) => {
  await uploadMock(page);
  await open(page);
  for (const [index, event] of ['paste', 'drop'].entries()) {
    await source(page).evaluate((el, event) => {
      const data = new DataTransfer();
      data.items.add(new File(['image'], 'photo.png', { type: 'image/png' }));
      el.dispatchEvent(event === 'paste' ? new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }) : new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    }, event);
    await expect(source(page).getByRole('img')).toHaveCount(index + 1);
    await expect(source(page).getByRole('img').last()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add image', exact: true })).toBeEnabled();
  }
  await page.getByRole('button', { name: 'Split view' }).click();
  await expect(page.getByRole('region', { name: 'Notes preview' }).getByRole('img')).toHaveCount(2);
  await page.getByRole('button', { name: 'Split view' }).click();
  await expect(source(page).getByRole('img')).toHaveCount(2);
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') });
  await expect(page.getByRole('alert')).toContainText('Choose PNG');
  await save(page);
  await page.reload();
  await expect(source(page).getByRole('img')).toHaveCount(2);
});

test('image removal and undo update decorations; fenced and unsafe URLs stay literal', async ({ page }) => {
  await uploadMock(page);
  await open(page, '![Image](/api/saved-attachments/photo)\n');
  await expect(source(page).getByRole('img')).toBeVisible();
  await pasteMarkdown(page, 'Removed image');
  await expect(source(page).getByRole('img')).toHaveCount(0);
  await source(page).press('Control+z');
  await expect(source(page).getByRole('img')).toBeVisible();
  const literalImages = '```md\n![Example](/api/saved-attachments/photo)\n```\n\n![Unsafe](javascript:alert(1))';
  await pasteMarkdown(page, literalImages);
  await expect(source(page)).toHaveText(literalImages + '\n');
  await expect(source(page).getByRole('img')).toHaveCount(0);
});

test('mobile split stacks panes and editor stays usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await uploadMock(page);
  await open(page, '# Tokyo\n\n![Image](/api/saved-attachments/photo)\n');
  await expect(source(page).getByRole('img')).toBeVisible();
  await page.getByRole('button', { name: 'Split view' }).click();
  await expect(source(page)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Notes preview' }).getByRole('heading', { name: 'Tokyo' })).toBeVisible();
  const boxes = await Promise.all([source(page).boundingBox(), page.getByRole('region', { name: 'Notes preview' }).boundingBox()]);
  expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y);
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Split view' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('mobile-editor.png'), fullPage: true });
});

test('saves remain ordered and coalesce typing during a pending request', async ({ page }) => {
  await open(page);
  await page.evaluate(() => { (window as any).saveDelay = 800; });
  await source(page).fill('First');
  await expect.poll(() => page.evaluate(() => (window as any).commits.length)).toBe(1);
  await source(page).fill('Second');
  await source(page).fill('Latest');
  await save(page);
  expect(await page.evaluate(() => (window as any).commits)).toEqual(['First\n', 'Latest\n']);
});

test('travel day edits directly, retains failed saves and restores notes after reload', async ({ page }) => {
  let fail = true;
  const row = { id: 'day', planId: 'trip', date: '2026-11-12', theme: 'Museums', hotel: 'Hotel', notes: 'Original', sortOrder: 0, updatedAt: '2026-11-12T00:00:00Z' };
  const plan = { id: 'trip', title: 'Tokyo', startDate: row.date, endDate: row.date, rowCount: 1, updatedAt: row.updatedAt, rows: [row] };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/config') return route.fulfill({ json: { googleClientId: '' } });
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { email: 'test@example.com', name: 'Test' } } });
    if (path === '/api/travel-plans') return route.fulfill({ json: { travelPlans: [plan] } });
    if (path === '/api/travel-plans/trip') return route.fulfill({ json: { travelPlan: plan } });
    if (path === '/api/travel-rows/day') {
      if (fail) return route.fulfill({ status: 500, json: { error: 'Save failed' } });
      Object.assign(row, route.request().postDataJSON());
      return route.fulfill({ json: { travelRow: row } });
    }
    return route.fulfill({ json: { checklists: [], lists: [], streams: [], items: [], emails: [], notes: [] } });
  });
  await page.goto('/travel/plans/trip/days/day');
  await expect(source(page)).toBeVisible();
  await expect(page.getByLabel('Theme', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to itinerary' })).toBeEnabled();
  await pasteMarkdown(page, '# Saved in the trip\n\n**Museum**');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Could not save notes');
  await expect(page.getByRole('button', { name: 'Back to itinerary' })).toBeDisabled();
  fail = false;
  await save(page);
  await expect(page.getByRole('button', { name: 'Back to itinerary' })).toBeEnabled();
  expect(row.notes).toBe('# Saved in the trip\n\n**Museum**\n');
  await page.getByRole('button', { name: 'Split view' }).click();
  await page.screenshot({ path: test.info().outputPath('travel-editor.png'), fullPage: true });
  await page.reload();
  await expect(source(page)).toContainText('# Saved in the trip');
});

test('blank lines survive opening, keyboard input, saving and reopening', async ({ page }) => {
  await open(page, 'Start\n\nEnd');
  await source(page).press('Control+End');
  await source(page).press('Enter');
  await source(page).press('Enter');
  await source(page).pressSequentially('Next');
  await save(page);
  expect(await page.evaluate(() => localStorage.getItem('notes'))).toBe('Start\n\nEnd\n\nNext\n');
  await page.reload();
  expect(await source(page).textContent()).toBe('Start\n\nEnd\n\nNext\n');
});

test('format buttons follow native selection and arrow keys, and remove only the active format', async ({ page }) => {
  await open(page, '***word*** plain\n');
  const bold = page.getByRole('button', { name: 'Bold', exact: true });
  const italic = page.getByRole('button', { name: 'Italic', exact: true });
  await selectSource(page, 5);
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await expect(italic).toHaveAttribute('aria-pressed', 'true');
  await bold.click();
  await expect(source(page)).toHaveText('*word* plain\n');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await expect(italic).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(source(page)).toHaveText('***word*** plain\n');
  // CLeditor restores the caret into the closing markers after undo.
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await selectSource(page, 5);
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(source(page)).toHaveText('*word* plain\n');
  await source(page).press('Control+End');
  await expect(italic).toHaveAttribute('aria-pressed', 'false');
  await source(page).press('Home');
  await source(page).press('ArrowRight');
  await expect(italic).toHaveAttribute('aria-pressed', 'true');
  await source(page).press('Control+i');
  await expect(source(page)).toHaveText('word plain\n');
  await expect(italic).toHaveAttribute('aria-pressed', 'false');
});

for (const [button, markdown, expected] of [
  ['Bold', '__word__\n', 'word\n'],
  ['Italic', '_word_\n', 'word\n'],
  ['Heading 1', '# word\n', 'word\n'],
  ['Heading 2', '## word\n', 'word\n'],
  ['List', '- word\n', 'word\n'],
  ['Link', '[word](https://example.com)\n', 'word\n'],
]) {
  test(`${button} toggles existing formatting and preserves a backward selection`, async ({ page }) => {
    await open(page, markdown);
    const offset = markdown.indexOf('word');
    await selectSource(page, offset + 3, offset + 1);
    const control = page.getByRole('button', { name: button, exact: true });
    await expect(control).toHaveAttribute('aria-pressed', 'true');
    await control.click();
    await expect(source(page)).toHaveText(expected);
    await expect(control).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => document.getSelection()?.toString())).toBe('or');
    await save(page);
    await page.reload();
    await expect(source(page)).toHaveText(expected);
  });
}

test('mixed selections and Markdown inside code leave formatting buttons inactive', async ({ page }) => {
  await open(page, '**word** plain\n`*literal*`\n```md\n**code**\n```\n');
  const bold = page.getByRole('button', { name: 'Bold', exact: true });
  const italic = page.getByRole('button', { name: 'Italic', exact: true });
  await selectSource(page, 3, 12);
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await selectSource(page, 19);
  await expect(italic).toHaveAttribute('aria-pressed', 'false');
  await selectSource(page, 35);
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
});

test('touch placement and toolbar taps preserve the caret while removing formatting', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await open(page, '**word** plain\n');
  const bold = page.getByRole('button', { name: 'Bold', exact: true });
  await source(page).locator('.md-strong').tap();
  await expect(bold).toHaveAttribute('aria-pressed', 'true');
  await bold.tap();
  await expect(source(page)).toHaveText('word plain\n');
  await expect(bold).toHaveAttribute('aria-pressed', 'false');
  await source(page).pressSequentially('X');
  await expect(source(page)).toContainText(/woXrd|worXd/);
  await context.close();
});

test('pasted images replace the selection at the cursor, retain following text and undo together', async ({ page }) => {
  await uploadMock(page);
  await open(page, 'Before selected after\n\nBottom\n');
  await selectSource(page, 7, 15);
  await source(page).evaluate(element => {
    const data = new DataTransfer();
    data.items.add(new File(['image'], 'photo.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(source(page).getByRole('img')).toBeVisible();
  await expect(source(page)).toHaveText('Before \n\n![Image](/api/saved-attachments/photo)\n\n after\n\nBottom\n');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(source(page)).toHaveText('Before selected after\n\nBottom\n');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(source(page).getByRole('img')).toBeVisible();
  await save(page);
  await page.reload();
  await expect(source(page)).toHaveText('Before \n\n![Image](/api/saved-attachments/photo)\n\n after\n\nBottom\n');
});

test('upload follows edits before the paste position and keeps the current typing cursor', async ({ page }) => {
  let finishUpload!: () => void;
  const pending = new Promise<void>(resolve => { finishUpload = resolve; });
  await uploadMock(page);
  await page.route('**/api/share-attachments', async route => {
    await pending;
    await route.fulfill({ json: { attachment: { url: '/api/saved-attachments/photo' } } });
  });
  await open(page, 'Before\n\nInsert here\n\nBottom\n');
  await selectSource(page, 8);
  await source(page).evaluate(element => {
    const data = new DataTransfer();
    data.items.add(new File(['image'], 'photo.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole('button', { name: 'Uploading image', exact: true })).toBeVisible();
  await selectSource(page, 0);
  await source(page).pressSequentially('Intro');
  await source(page).press('Enter');
  await source(page).press('Enter');
  await source(page).press('Control+End');
  await source(page).pressSequentially(' tail');
  finishUpload();
  await expect(source(page).getByRole('img')).toBeVisible();
  await expect(source(page)).toHaveText('Intro\n\nBefore\n\n![Image](/api/saved-attachments/photo)\n\nInsert here\n\nBottom tail\n');
  await source(page).pressSequentially('!');
  await expect(source(page)).toContainText('Bottom tail!');
});

test('H1 and H2 apply, switch and toggle with distinct sizes in the source and preview', async ({ page }) => {
  await open(page, 'Title\n\nBody\n');
  const h1 = page.getByRole('button', { name: 'Heading 1', exact: true });
  const h2 = page.getByRole('button', { name: 'Heading 2', exact: true });
  await selectSource(page, 2);
  await h1.click();
  await expect(source(page)).toHaveText('# Title\n\nBody\n');
  await expect(h1).toHaveAttribute('aria-pressed', 'true');
  await expect(h2).toHaveAttribute('aria-pressed', 'false');
  const h1Size = await source(page).locator('.md-heading-1').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  await page.getByRole('button', { name: 'Split view' }).click();
  await expect(page.getByRole('region', { name: 'Notes preview' }).getByRole('heading', { name: 'Title', level: 1 })).toBeVisible();
  await h2.click();
  await expect(source(page)).toHaveText('## Title\n\nBody\n');
  await expect(h1).toHaveAttribute('aria-pressed', 'false');
  await expect(h2).toHaveAttribute('aria-pressed', 'true');
  const h2Size = await source(page).locator('.md-heading-2').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(h1Size).toBeGreaterThan(h2Size);
  expect(h2Size).toBeGreaterThan(16);
  await expect(page.getByRole('region', { name: 'Notes preview' }).getByRole('heading', { name: 'Title', level: 2 })).toBeVisible();
  await h2.click();
  await expect(source(page)).toHaveText('Title\n\nBody\n');
});

test('source shows bullets beside small Markdown markers without adding them to saved text', async ({ page }) => {
  const markdown = '# Title\n\n**bold** and *italic*\n- First\n    + Nested\n* Last\n\n```md\n- Literal\n```\n';
  await open(page, markdown);
  const bodySize = await source(page).locator('.md-strong').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  const markerSize = await source(page).locator('.md-syntax').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(markerSize).toBeLessThan(bodySize);
  await expect(source(page).locator('.md-list-marker')).toHaveCount(3);
  for (const marker of await source(page).locator('.md-list-marker').all()) {
    await expect(marker).toBeVisible();
    expect(await marker.evaluate(el => getComputedStyle(el, '::after').content)).toBe('"•"');
  }
  await expect(source(page)).toHaveText(markdown);
  await selectSource(page, markdown.indexOf('First') + 2);
  await source(page).pressSequentially('X');
  await save(page);
  const saved = markdown.replace('First', 'FiXrst');
  expect(await page.evaluate(() => localStorage.getItem('notes'))).toBe(saved);
  await page.reload();
  await expect(source(page)).toHaveText(saved);
  await page.screenshot({ path: test.info().outputPath('markdown-decorations.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('markdown-decorations-mobile.png'), fullPage: true });
});

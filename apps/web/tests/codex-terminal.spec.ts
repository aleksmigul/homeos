import { test, expect, type Page } from '@playwright/test';
const id = 'cx-11111111-1111-4111-8111-111111111111';
async function setup(page: Page, developer = true) {
  let sessions: Array<{ id: string; createdAt: string; ended: boolean }> = [];
  const input: Array<{ type: string; data?: string; cols?: number; rows?: number }> = [];
  let connections = 0;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/config') return route.fulfill({ json: { googleClientId: '' } });
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { email: 'dev@example.com', name: 'Developer', developer } } });
    if (path === '/api/dev/terminal/sessions') {
      if (route.request().method() === 'POST') {
        sessions = [{ id, createdAt: new Date().toISOString(), ended: false }];
        return route.fulfill({ status: 201, json: { session: sessions[0] } });
      }
      return route.fulfill({ json: { sessions } });
    }
    if (path === `/api/dev/terminal/sessions/${id}` && route.request().method() === 'DELETE') {
      sessions = []; return route.fulfill({ json: { ended: true } });
    }
    if (path === '/api/dev/codex-requests') return route.fulfill({ json: { requests: [] } });
    return route.fulfill({ json: { travelPlans: [], checklists: [], streams: [], current: [], archived: [], todoLists: [], sharedTodoList: { id: 'shared' }, emails: [], chores: [] } });
  });
  await page.routeWebSocket(`**/api/dev/terminal/sessions/${id}/socket`, ws => {
    connections++;
    ws.send('\x1b[?2004h\r\nCodex CLI — connected to persistent session\r\n> ');
    ws.onMessage(message => {
      const data = JSON.parse(String(message)); input.push(data);
      if (data.type === 'input') ws.send(`\r\nreceived:${data.data}\r\n> `);
    });
  });
  return { input, connections: () => connections };
}

test('separate terminal module creates, streams, sends prompts and native keys, reconnects and ends', async ({ page }) => {
  const mock = await setup(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/codex-terminal');
  await expect(page.getByRole('button', { name: 'Dev', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Codex Terminal', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start a Codex session' })).toBeVisible();
  await page.getByRole('button', { name: 'New session' }).click();
  await expect(page.getByRole('status')).toHaveText('Connected');
  await expect(page.locator('.xterm-accessibility-tree')).toContainText('Codex CLI');
  await expect.poll(() => mock.input.some(item => item.type === 'resize' && item.cols! >= 20 && item.rows! >= 5)).toBe(true);
  await page.getByLabel('Message to this session').fill('Inspect the travel planner');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => mock.input.some(item => item.data?.includes('Inspect the travel planner'))).toBe(true);
  expect(mock.input.some(item => item.data === '\r')).toBe(true);
  await page.getByRole('button', { name: 'Ctrl+C', exact: true }).click();
  await page.getByRole('button', { name: 'Esc', exact: true }).click();
  await expect.poll(() => mock.input.some(item => item.data === '\x03')).toBe(true);
  expect(mock.input.some(item => item.data === '\x1b')).toBe(true);
  await page.getByRole('button', { name: 'Reconnect session' }).click();
  await expect.poll(mock.connections).toBe(2);
  await expect(page.getByRole('status')).toHaveText('Connected');
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Connected');
  await expect.poll(mock.connections).toBe(3);
  await page.screenshot({ path: test.info().outputPath('codex-terminal.png'), fullPage: true });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'End session' }).click();
  await expect(page.getByRole('heading', { name: 'Start a Codex session' })).toBeVisible();
  await page.getByRole('button', { name: 'Dev', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Queue request' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('terminal is hidden from non-developers, including direct URL navigation', async ({ page }) => {
  await setup(page, false);
  await page.goto('/codex-terminal');
  await expect(page.getByRole('button', { name: 'Codex Terminal', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New session' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Checklists', exact: true })).toBeVisible();
});

test('mobile controls fit and send multiline input to the live terminal', async ({ page }) => {
  const mock = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/codex-terminal');
  await page.getByRole('button', { name: 'New session' }).click();
  await expect(page.getByRole('status')).toHaveText('Connected');
  await page.getByLabel('Message to this session').fill('First line\nSecond line');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect.poll(() => mock.input.some(item => item.data?.includes('First line\rSecond line'))).toBe(true);
  await page.getByRole('button', { name: '↑', exact: true }).click();
  await expect.poll(() => mock.input.some(item => item.data === '\x1b[A')).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('codex-terminal-mobile.png'), fullPage: true });
});

test('bridge outage is recoverable and does not fabricate a session', async ({ page }) => {
  await setup(page);
  await page.route('**/api/dev/terminal/sessions', route => route.fulfill({ status: 503, json: { error: 'Codex Terminal is unavailable. Check the terminal bridge service.' } }));
  await page.goto('/codex-terminal');
  await expect(page.getByRole('alert')).toContainText('bridge service');
  await page.getByRole('button', { name: 'New session' }).click();
  await expect(page.getByRole('alert')).toContainText('bridge service');
  await expect(page.getByRole('status')).toHaveText('No active session');
});

import { test, expect, type Page } from '@playwright/test';

test.use({ locale: 'en-US', timezoneId: 'America/Los_Angeles' });

type Activity = { id: string; text: string; day: string | null; position: number; completedAt: string | null; createdAt: string };
const activity = (id: string, text: string, day: string | null, position: number, completedAt: string | null): Activity => ({
  id, text, day, position, completedAt, createdAt: '2026-11-01T12:00:00Z',
});

async function setup(page: Page, initial: Activity[]) {
  let chores = initial;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/config') return route.fulfill({ json: { googleClientId: '' } });
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { email: 'test@example.com', name: 'Test' } } });
    if (path === '/api/weekend-chores') return route.fulfill({ json: { chores } });
    if (path.startsWith('/api/weekend-chores/') && route.request().method() === 'PATCH') {
      expect(route.request().postDataJSON()).toEqual({ action: 'done' });
      const id = path.split('/').at(-1);
      chores = chores.map(item => item.id === id ? { ...item, completedAt: '2026-11-16T18:00:00Z' } : item);
      return route.fulfill({ json: { chores } });
    }
    return route.fulfill({ json: { travelPlans: [], checklists: [], streams: [], current: [], archived: [], todoLists: [], sharedTodoList: { id: 'shared' }, emails: [], chores: [] } });
  });
}

test('history uses scheduled dates and planned order even when completion is recorded days later', async ({ page }) => {
  await setup(page, [
    activity('second', 'Afternoon walk', '2026-11-14', 1, '2026-11-16T20:00:00Z'),
    activity('sunday', 'Sunday brunch', '2026-11-15', 0, '2026-11-15T18:00:00Z'),
    activity('first', 'Morning market', '2026-11-14', 0, '2026-11-16T00:30:00Z'),
    activity('open', 'Still to do', '2026-11-14', 2, null),
  ]);
  await page.goto('/weekend/history');
  await expect(page.getByRole('heading', { name: 'Activity history', exact: true })).toBeVisible();
  const groups = page.locator('.weekend-content .weekend-bucket');
  await expect(groups.locator('h2')).toHaveText(['Sunday, Nov 15, 2026', 'Saturday, Nov 14, 2026']);
  await expect(groups.nth(1).locator('.weekend-history-row strong')).toHaveText(['Morning market', 'Afternoon walk']);
  await expect(page.getByText('Still to do', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Marked complete', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Planned for Saturday, Nov 14, 2026', { exact: true })).toHaveCount(2);
});

test('unscheduled activities fall back to the local completion date and are labeled unscheduled', async ({ page }) => {
  await setup(page, [activity('spontaneous', 'Spontaneous picnic', null, 0, '2026-11-16T01:30:00Z')]);
  await page.goto('/weekend/history');
  await expect(page.locator('.weekend-bucket h2')).toHaveText('Sunday, Nov 15, 2026');
  await expect(page.locator('.weekend-history-row')).toContainText('Unscheduled · Marked complete');
});

test('marking an overdue activity complete keeps it under its scheduled weekend', async ({ page }) => {
  await setup(page, [activity('overdue', 'Visit market', '2026-11-14', 0, null)]);
  await page.goto('/weekend');
  await page.getByRole('button', { name: 'Done: Visit market', exact: true }).click();
  await page.getByRole('button', { name: 'History', exact: true }).click();
  await expect(page.locator('.weekend-bucket h2')).toHaveText('Saturday, Nov 14, 2026');
  await expect(page.locator('.weekend-history-row strong')).toHaveText('Visit market');
  await expect(page.getByRole('heading', { name: 'Monday, Nov 16, 2026', exact: true })).toHaveCount(0);
});

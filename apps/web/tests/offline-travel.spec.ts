import { test, expect, type Page } from '@playwright/test';

async function ready(page: Page) {
  await expect(page.getByRole('status').filter({ hasText: /^Available offline$/ })).toBeVisible({ timeout: 30000 });
}
test.beforeEach(async ({ request }) => { await request.post('/__test/reset'); });

test('mobile app relaunches offline and opens an unvisited trip with notes, images and emails', async ({ page, context }) => {
  await page.goto('/travel');
  await ready(page);
  await context.setOffline(true);
  await page.close();
  const reopened = await context.newPage();
  // Use the installed app's start URL, without relying on an already-open page.
  await reopened.goto('/?pwa=2');
  await expect(reopened.getByText('Offline', { exact: true })).toBeVisible();
  await reopened.getByRole('button', { name: 'Open menu', exact: true }).click();
  await reopened.getByRole('navigation', { name: 'Modules' }).getByRole('button', { name: 'Travel', exact: true }).click();
  await reopened.getByRole('button', { name: /A trip 2/ }).click();
  await reopened.getByRole('button', { name: 'Expand all days', exact: true }).click();
  await expect(reopened.getByRole('heading', { name: 'Saved itinerary 2', exact: true })).toBeVisible();
  await expect(reopened.getByText('Trip 2 directions.', { exact: true })).toBeVisible();
  const image = reopened.getByRole('img', { name: 'Map', exact: true });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(180);
  await expect(reopened.getByRole('button', { name: 'Edit day 2026-11-13', exact: true })).toBeDisabled();
  await expect(reopened.getByRole('button', { name: 'Delete A trip 2', exact: true })).toBeDisabled();
  await reopened.getByRole('button', { name: /Reservation confirmation/ }).click();
  await expect(reopened.getByText('Booking for A trip 2. Confirmation 12345.', { exact: true })).toBeVisible();
  await reopened.reload();
  await expect(reopened.getByRole('heading', { name: 'A trip 2', exact: true })).toBeVisible();
});

test('a successful online note edit is in the offline copy immediately', async ({ page, context }) => {
  await page.goto('/travel/plans/a-trip-1');
  await ready(page);
  await page.getByRole('button', { name: 'Edit day 2026-11-13', exact: true }).click();
  await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Updated offline directions\n\nMeet at gate 9.');
  await page.getByRole('button', { name: 'Save notes', exact: true }).click();
  await expect(page.locator('.notes-save-status')).toHaveText('Saved');
  await context.setOffline(true);
  await page.reload();
  await page.getByRole('button', { name: 'Expand all days', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Updated offline directions', exact: true })).toBeVisible();
  await expect(page.getByText('Meet at gate 9.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toHaveCount(0);
});

test('switching accounts replaces private offline data and logout removes it', async ({ page, context }) => {
  await page.goto('/travel');
  await ready(page);
  await page.getByRole('button', { name: 'Switch account', exact: true }).click();
  await page.getByRole('button', { name: 'b@example.com', exact: true }).click();
  await ready(page);
  await expect(page.getByRole('button', { name: /B trip 1/ })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('button', { name: /B trip 2/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /A trip/ })).toHaveCount(0);
  await context.setOffline(false);
  await ready(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'The Annexation', exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Connect to the internet to sign in and download trips.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /B trip/ })).toHaveCount(0);
});

test('an interrupted refresh keeps downloaded trips but does not claim a complete new download', async ({ page, context, request }) => {
  await page.goto('/travel');
  await ready(page);
  await request.post('/__test/fail-travel');
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByRole('status').filter({ hasText: 'Offline download incomplete' })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'No complete offline copy saved yet.' })).toBeVisible();
  await page.getByRole('button', { name: /A trip 1/ }).click();
  await page.getByRole('button', { name: 'Expand all days', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved itinerary 1', exact: true })).toBeVisible();
});

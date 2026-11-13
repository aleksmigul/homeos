import { test, expect, type Page } from '@playwright/test';

const rows = ['Museums', 'Gardens', 'Markets'].map((theme, index) => ({
  id: `day-${index + 1}`, planId: 'trip', date: `2026-11-${13 + index}`, theme, hotel: `Hotel ${index + 1}`,
  notes: `# ${theme} notes\n\n` + 'Plans for the morning, afternoon and evening.\n\n'.repeat(8),
  sortOrder: index, updatedAt: '2026-11-13T00:00:00Z',
}));
const plan = { id: 'trip', title: 'Autumn trip', startDate: rows[0].date, endDate: rows[2].date, rowCount: rows.length, rows, updatedAt: rows[0].updatedAt };

async function openPlanner(page: Page) {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/auth/config') return route.fulfill({ json: { googleClientId: '' } });
    if (path === '/api/auth/me') return route.fulfill({ json: { user: { email: 'test@example.com', name: 'Test' } } });
    if (path === '/api/travel-plans') return route.fulfill({ json: { travelPlans: [plan] } });
    if (path === '/api/travel-plans/trip') return route.fulfill({ json: { travelPlan: plan } });
    if (path === '/api/travel-plans/trip/emails') return route.fulfill({ json: { emails: [{
      id: 'email', subject: 'Hotel confirmation', sender: 'Hotel <hotel@example.com>', receivedAt: rows[0].updatedAt, attachments: [],
    }] } });
    return route.fulfill({ json: { checklists: [], lists: [], streams: [], items: [], emails: [], notes: [] } });
  });
  await page.goto('/travel/plans/trip');
  await expect(page.getByRole('heading', { name: plan.title, exact: true })).toBeVisible();
}

const itinerary = (page: Page) => page.getByRole('region', { name: 'Travel itinerary table' });
const day = (page: Page, name: string) => itinerary(page).getByRole('button', { name, exact: true });

test('days expand independently and the all-days button handles collapsed, mixed and expanded states', async ({ page }) => {
  await openPlanner(page);
  await expect(itinerary(page).locator('.day-details')).toHaveCount(0);
  await day(page, 'Museums').click();
  await day(page, 'Gardens').click();
  await expect(day(page, 'Museums')).toHaveAttribute('aria-expanded', 'true');
  await expect(day(page, 'Gardens')).toHaveAttribute('aria-expanded', 'true');
  await expect(itinerary(page).locator('.day-details')).toHaveCount(2);
  await day(page, 'Museums').click();
  await expect(day(page, 'Museums')).toHaveAttribute('aria-expanded', 'false');
  await expect(day(page, 'Gardens')).toHaveAttribute('aria-expanded', 'true');

  await page.getByRole('button', { name: 'Expand all days', exact: true }).click();
  await expect(itinerary(page).locator('.day-details')).toHaveCount(3);
  for (const row of rows) await expect(day(page, row.theme)).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: 'Collapse all days', exact: true })).toHaveAttribute('aria-expanded', 'true');
  await day(page, 'Gardens').click();
  await expect(day(page, 'Museums')).toHaveAttribute('aria-expanded', 'true');
  await expect(day(page, 'Markets')).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Expand all days', exact: true }).click();
  await page.getByRole('button', { name: 'Collapse all days', exact: true }).click();
  await expect(itinerary(page).locator('.day-details')).toHaveCount(0);
  for (const row of rows) await expect(day(page, row.theme)).toHaveAttribute('aria-expanded', 'false');
});

test('returning from editing a day preserves the independent open days', async ({ page }) => {
  await openPlanner(page);
  await day(page, 'Museums').click();
  await day(page, 'Markets').click();
  await page.getByRole('button', { name: 'Edit day 2026-11-13', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Markdown source' })).toBeVisible();
  await page.getByRole('button', { name: 'Back to itinerary', exact: true }).click();
  await expect(day(page, 'Museums')).toHaveAttribute('aria-expanded', 'true');
  await expect(day(page, 'Gardens')).toHaveAttribute('aria-expanded', 'false');
  await expect(day(page, 'Markets')).toHaveAttribute('aria-expanded', 'true');
});

for (const mobile of [false, true]) {
  test(`${mobile ? 'mobile' : 'desktop'} expanded days scroll continuously, with emails below the final day`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 700 });
    await openPlanner(page);
    const expand = page.getByRole('button', { name: 'Expand all days', exact: true });
    await expand.click();
    await expect(itinerary(page).locator('.day-details')).toHaveCount(3);
    const lastDay = itinerary(page).locator('.itinerary-day').last();
    const lastNotes = lastDay.getByRole('heading', { name: 'Markets notes', exact: true });
    await lastNotes.scrollIntoViewIfNeeded();
    await expect(lastNotes).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    const emails = page.getByRole('region', { name: 'Trip emails', exact: true });
    await expect(emails.getByRole('button', { name: /Hotel confirmation/ })).toBeVisible();
    const dayBox = await lastDay.boundingBox();
    const emailBox = await emails.boundingBox();
    expect(emailBox!.y).toBeGreaterThanOrEqual(dayBox!.y + dayBox!.height);
    expect(await itinerary(page).evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('.trip-emails')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`travel-expanded-${mobile ? 'mobile' : 'desktop'}.png`), fullPage: true });
  });
}

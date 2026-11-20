import { test, expect, type Page } from '@playwright/test';

const rows = (page: Page) => page.locator('tbody tr');
const searchInput = (page: Page) => page.getByLabel('חיפוש פניות', { exact: true });
const searchButton = (page: Page) => page.getByRole('button', { name: 'חפש', exact: true });
const createButton = (page: Page) => page.getByRole('button', { name: 'צור פנייה', exact: true });
const filter = (page: Page) => page.getByRole('combobox', { name: 'סינון לפי סטטוס' });

test('starts with 25 seed records, 10 rows, correct paging and RTL', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(rows(page)).toHaveCount(10);
  await expect(page.getByRole('columnheader', { name: 'מספר פניה', exact: true })).toBeVisible();
  const firstPageNumbers = await page.locator('.ticket-id').allTextContents();
  expect(firstPageNumbers.map(Number)).toEqual([25, 24, 23, 22, 21, 20, 19, 18, 17, 16]);
  await expect(rows(page).first().getByRole('combobox').locator('option')).toHaveText(['פתוחה', 'בטיפול', 'סגורה']);
  await expect(page.getByText('עמוד 1 מתוך 3', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'הקודם' })).toBeDisabled();
  await page.getByRole('button', { name: 'הבא' }).click();
  await expect(rows(page)).toHaveCount(10);
  await expect(page.locator('.ticket-description').filter({ hasText: /^—$/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'הבא' }).click();
  await expect(rows(page)).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'הבא' })).toBeDisabled();
});

test('applies Hebrew title search and status together only on submit, including Enter', async ({ page }) => {
  await page.goto('/');
  await expect(rows(page)).toHaveCount(10);
  await searchInput(page).fill('חשבונית');
  await filter(page).selectOption('open');
  await expect(rows(page)).toHaveCount(10);
  await searchInput(page).press('Enter');
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('חשבונית חסרה');
  await filter(page).selectOption('');
  await searchButton(page).click();
  await expect(rows(page)).toHaveCount(2);
  await searchInput(page).fill('אין פנייה עם הכותרת הזאת');
  await searchButton(page).click();
  await expect(page.getByRole('heading', { name: 'לא נמצאו פניות' })).toBeVisible();
  await expect(createButton(page)).toBeEnabled();
  await expect(page.getByRole('button', { name: 'הקודם' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'הבא' })).toBeDisabled();
});

test('validates fields, then creates and resets form, filters and page', async ({ page }) => {
  await page.goto('/');
  await createButton(page).click();
  await expect(page.getByText('הכותרת צריכה להכיל לפחות 3 תווים.')).toBeVisible();
  await page.getByRole('textbox', { name: 'כותרת', exact: false }).fill('  בדיקת יצירה חדשה  ');
  await page.getByRole('textbox', { name: 'תיאור', exact: true }).fill('א'.repeat(2001));
  await createButton(page).click();
  await expect(page.getByText('התיאור יכול להכיל עד 2,000 תווים.')).toBeVisible();
  await page.getByRole('textbox', { name: 'תיאור', exact: true }).fill('');
  await page.getByRole('button', { name: 'הבא' }).click();
  await expect(page.getByText('עמוד 2 מתוך 3', { exact: true })).toBeVisible();
  await searchInput(page).fill('טקסט שטרם הופעל');
  await filter(page).selectOption('closed');
  await createButton(page).click();
  await expect(rows(page).first()).toContainText('בדיקת יצירה חדשה');
  await expect(rows(page).first().getByRole('combobox')).toHaveValue('open');
  await expect(rows(page).first()).toContainText('—');
  await expect(searchInput(page)).toHaveValue('');
  await expect(filter(page)).toHaveValue('');
  await expect(page.getByRole('textbox', { name: 'כותרת', exact: false })).toHaveValue('');
  await expect(page.getByText('עמוד 1 מתוך 3', { exact: true })).toBeVisible();
  await expect(page.getByText(/נוצרה בהצלחה/)).toBeVisible();
});

test('preserves the applied filter when paging even if draft inputs changed', async ({ page }) => {
  await page.goto('/');
  await searchInput(page).fill('');
  await searchButton(page).click();
  await expect(rows(page)).toHaveCount(10);
  await searchInput(page).fill('לא הופעל');
  await filter(page).selectOption('closed');
  const response = page.waitForResponse((r) => r.url().includes('/api/tickets?') && new URL(r.url()).searchParams.get('page') === '2');
  await page.getByRole('button', { name: 'הבא' }).click();
  const params = new URL((await response).url()).searchParams;
  expect(params.get('q')).toBe('');
  expect(params.get('status')).toBe('');
  await expect(rows(page)).toHaveCount(10);
});

test('shows loading, then retries the exact failed list query', async ({ page }) => {
  await page.goto('/');
  await expect(rows(page)).toHaveCount(10);
  let attemptedUrl = '';
  await page.route('**/api/tickets?*', async (route) => {
    attemptedUrl = route.request().url();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({ status: 503, json: { error: { message: 'תקלה זמנית בבדיקה' } } });
  });
  await searchInput(page).fill('חשבונית');
  await filter(page).selectOption('closed');
  await searchButton(page).click();
  await expect(page.getByText('טוען פניות…', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'הקודם' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'הבא' })).toBeDisabled();
  await expect(page.getByText('תקלה זמנית בבדיקה')).toBeVisible();
  await page.unroute('**/api/tickets?*');
  const retry = page.waitForRequest((r) => r.url() === attemptedUrl);
  await page.getByRole('button', { name: 'נסה שוב' }).click();
  await retry;
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('חשבונית כפולה');
});

test('a failed create preserves inputs, blocks duplicate submission, and allows retry', async ({ page }) => {
  await page.goto('/');
  await expect(rows(page)).toHaveCount(10);
  let writes = 0;
  await page.route('**/api/tickets', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return route.fulfill({ status: 500, json: { error: { message: 'היצירה נכשלה בבדיקה' } } });
  });
  const title = page.getByRole('textbox', { name: 'כותרת', exact: false });
  const description = page.getByRole('textbox', { name: 'תיאור', exact: true });
  await title.fill('פנייה שלא תישמר בכשל');
  await description.fill('התוכן נשמר בטופס');
  await createButton(page).click();
  await expect(page.getByRole('button', { name: 'יוצר פנייה…' })).toBeDisabled();
  await expect(rows(page).filter({ hasText: 'פנייה שלא תישמר בכשל' })).toHaveCount(0);
  await expect(page.getByText('היצירה נכשלה בבדיקה')).toBeVisible();
  await expect(title).toHaveValue('פנייה שלא תישמר בכשל');
  await expect(description).toHaveValue('התוכן נשמר בטופס');
  expect(writes).toBe(1);
  await page.unroute('**/api/tickets');
  await createButton(page).click();
  await expect(rows(page).first()).toContainText('פנייה שלא תישמר בכשל');
});

test('rolls back status on failure and disables the selector during the write', async ({ page }) => {
  await page.goto('/');
  await expect(rows(page)).toHaveCount(10);
  const select = rows(page).first().getByRole('combobox');
  const original = await select.inputValue();
  const target = original === 'closed' ? 'open' : 'closed';
  await page.route('**/api/tickets/*/status', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 350));
    await route.fulfill({ status: 500, json: { error: { message: 'העדכון נכשל בבדיקה' } } });
  });
  await select.selectOption(target);
  await expect(select).toBeDisabled();
  await expect(page.getByText('העדכון נכשל בבדיקה')).toBeVisible();
  await expect(select).toHaveValue(original);
  await expect(select).toBeEnabled();
  await page.unroute('**/api/tickets/*/status');
  await select.selectOption(target);
  await expect(select).toBeEnabled();
  await expect(select).toHaveValue(target);
  await page.reload();
  await expect(rows(page).first().getByRole('combobox')).toHaveValue(target);
});

test('returns to the previous page when the only matching row on the last page changes status', async ({ page, request }) => {
  const prefix = 'בדיקת דפדוף אוטומטית';
  for (let index = 0; index < 11; index++) {
    const response = await request.post('/api/tickets', { data: { title: `${prefix} ${index}` } });
    expect(response.status()).toBe(201);
  }
  await page.goto('/');
  await searchInput(page).fill(prefix);
  await filter(page).selectOption('open');
  await searchButton(page).click();
  await expect(rows(page)).toHaveCount(10);
  await page.getByRole('button', { name: 'הבא' }).click();
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().getByRole('combobox').selectOption('closed');
  await expect(page.getByText('עמוד 1 מתוך 1', { exact: true })).toBeVisible();
  await expect(rows(page)).toHaveCount(10);
  await expect(filter(page)).toHaveValue('open');
  await expect(searchInput(page)).toHaveValue(prefix);
});

test('ignores an older search response even when fetch cancellation is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => originalFetch(input, { ...init, signal: undefined });
  });
  await page.goto('/');
  await expect(rows(page)).toHaveCount(10);
  const oldRequest = page.waitForRequest((r) => new URL(r.url()).searchParams.get('q') === 'ישן');
  await page.route('**/api/tickets?*', async (route) => {
    const q = new URL(route.request().url()).searchParams.get('q');
    if (q !== 'ישן' && q !== 'חדש') return route.continue();
    if (q === 'ישן') await new Promise((resolve) => setTimeout(resolve, 700));
    return route.fulfill({ json: {
      tickets: [{ id: q === 'ישן' ? 800 : 900, title: `תשובה ${q}`, description: '', status: 'open', created_at: new Date().toISOString() }],
      pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
    } });
  });
  await searchInput(page).fill('ישן');
  await searchButton(page).click();
  await oldRequest;
  const oldResponse = page.waitForResponse((r) => new URL(r.url()).searchParams.get('q') === 'ישן');
  await searchInput(page).fill('חדש');
  await searchButton(page).click();
  await expect(rows(page).first()).toContainText('תשובה חדש');
  await (await oldResponse).finished();
  await expect(rows(page).first()).toContainText('תשובה חדש');
  await expect(rows(page).filter({ hasText: 'תשובה ישן' })).toHaveCount(0);
});

test('remains usable on a narrow screen without overflowing the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(rows(page)).toHaveCount(10);
  await expect(createButton(page)).toBeVisible();
  await expect(searchButton(page)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('validates trimmed title boundaries and accepts a 2,000-character description', async ({ page }) => {
  await page.goto('/');
  const title = page.getByRole('textbox', { name: 'כותרת', exact: false });
  const description = page.getByRole('textbox', { name: 'תיאור', exact: true });
  await title.fill(' אב ');
  await createButton(page).click();
  await expect(page.locator('#title-error')).toHaveText('הכותרת צריכה להכיל לפחות 3 תווים.');
  await title.fill('א'.repeat(101));
  await createButton(page).click();
  await expect(page.locator('#title-error')).toHaveText('הכותרת יכולה להכיל עד 100 תווים.');
  await title.fill(`  ${'א'.repeat(100)}  `);
  await description.fill('ב'.repeat(2000));
  const submitted = page.waitForRequest((r) => r.method() === 'POST' && new URL(r.url()).pathname === '/api/tickets');
  await createButton(page).click();
  expect((await submitted).postDataJSON()).toEqual({ title: 'א'.repeat(100), description: 'ב'.repeat(2000) });
  await expect(rows(page).first().locator('.ticket-title')).toHaveText('א'.repeat(100));
  await expect(title).toHaveValue('');
  await expect(description).toHaveValue('');
});

test('allows every status transition and handles an empty first page after an update', async ({ page, request }) => {
  const title = 'בדיקת כל מעברי הסטטוס';
  const created = await request.post('/api/tickets', { data: { title } });
  expect(created.status()).toBe(201);
  const { ticket } = await created.json();
  await page.goto('/');
  await searchInput(page).fill(title);
  await searchButton(page).click();
  await expect(rows(page)).toHaveCount(1);

  for (const status of ['closed', 'in_progress', 'open', 'in_progress', 'closed', 'open']) {
    const update = page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().endsWith(`/api/tickets/${ticket.id}/status`));
    const reload = page.waitForResponse((r) => r.request().method() === 'GET' && new URL(r.url()).searchParams.get('q') === title);
    await rows(page).first().getByRole('combobox').selectOption(status);
    expect((await update).status()).toBe(200);
    await reload;
    await expect(rows(page).first().getByRole('combobox')).toHaveValue(status);
    await expect(searchInput(page)).toHaveValue(title);
  }

  await filter(page).selectOption('open');
  await searchButton(page).click();
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().getByRole('combobox').selectOption('closed');
  await expect(page.getByRole('heading', { name: 'לא נמצאו פניות' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'הקודם' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'הבא' })).toBeDisabled();
  await expect(createButton(page)).toBeEnabled();
  await expect(filter(page)).toHaveValue('open');
  await expect(searchInput(page)).toHaveValue(title);
});

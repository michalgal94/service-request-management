import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createApp } from '../app.js';
import { openDatabase } from '../database.js';
import { seedDatabaseIfEmpty } from '../seed.js';

describe('ticket HTTP API with a real SQLite database', () => {
  let db: DatabaseSync;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    app = createApp(db, { logErrors: false });
  });
  afterEach(() => db.close());

  it('seeds 25 varied tickets once and paginates 10 / 10 / 5, newest first', async () => {
    assert.equal(seedDatabaseIfEmpty(db), true);
    assert.equal(seedDatabaseIfEmpty(db), false);
    const first = await request(app).get('/api/tickets').expect(200);
    const second = await request(app).get('/api/tickets?page=2').expect(200);
    const third = await request(app).get('/api/tickets?page=3').expect(200);
    assert.equal(first.body.tickets.length, 10);
    assert.equal(second.body.tickets.length, 10);
    assert.equal(third.body.tickets.length, 5);
    assert.deepEqual(first.body.pagination, { page: 1, pageSize: 10, total: 25, totalPages: 3 });
    const all = [...first.body.tickets, ...second.body.tickets, ...third.body.tickets];
    assert.equal(new Set(all.map((ticket) => ticket.id)).size, 25);
    assert.deepEqual(all.map((ticket) => ticket.id), Array.from({ length: 25 }, (_, index) => 25 - index));
    assert.equal(new Set(all.map((ticket) => ticket.status)).size, 3);
    for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].created_at >= all[i].created_at);
    assert.ok(all.some((ticket) => ticket.description === ''));
  });

  it('sorts by creation time first and descending ID when dates are equal', async () => {
    const insert = db.prepare('INSERT INTO tickets (title, created_at) VALUES (?, ?)');
    insert.run('פנייה ראשונה', '2026-01-01T10:00:00.000Z');
    insert.run('פנייה שנייה', '2026-01-01T10:00:00.000Z');
    insert.run('פנייה עם תאריך מוקדם יותר', '2025-12-01T10:00:00.000Z');
    const { body } = await request(app).get('/api/tickets').expect(200);
    assert.deepEqual(body.tickets.map((ticket: { id: number }) => ticket.id), [2, 1, 3]);
  });

  it('creates a trimmed title with server-owned ID, date and initial status', async () => {
    const { body } = await request(app).post('/api/tickets').send({ title: '  פנייה חדשה  ' }).expect(201);
    assert.equal(body.ticket.title, 'פנייה חדשה');
    assert.equal(body.ticket.description, '');
    assert.equal(body.ticket.status, 'open');
    assert.equal(body.ticket.id, 1);
    assert.ok(Number.isFinite(Date.parse(body.ticket.created_at)));
    assert.ok(Math.abs(Date.now() - Date.parse(body.ticket.created_at)) < 5000);
    await request(app).post('/api/tickets').send({ title: 'פנייה חדשה', id: 12, status: 'closed', created_at: 'yesterday' }).expect(400);
  });

  it('validates title boundaries after trimming and description length on the server', async () => {
    for (const title of ['', '   ', ' אב ', 'א'.repeat(101)]) {
      const response = await request(app).post('/api/tickets').send({ title }).expect(400);
      assert.ok(response.body.error.fields.title);
    }
    for (const title of [' אבג ', `  ${'א'.repeat(100)}  `]) {
      await request(app).post('/api/tickets').send({ title, description: 'ב'.repeat(2000) }).expect(201);
    }
    const invalid = await request(app).post('/api/tickets').send({ title: 'כותרת תקינה', description: 'ב'.repeat(2001) }).expect(400);
    assert.ok(invalid.body.error.fields.description);
    for (const input of [{ title: null }, { title: 123 }, { title: 'כותרת', description: null }, {}]) {
      await request(app).post('/api/tickets').send(input).expect(400);
    }
    const list = await request(app).get('/api/tickets');
    assert.equal(list.body.pagination.total, 2);
  });

  it('combines literal Hebrew title substring search AND status filtering', async () => {
    seedDatabaseIfEmpty(db);
    const openInvoices = await request(app).get('/api/tickets').query({ q: 'חשבונית', status: 'open' }).expect(200);
    assert.equal(openInvoices.body.tickets.length, 1);
    assert.equal(openInvoices.body.tickets[0].title, 'חשבונית חסרה');
    const invoices = await request(app).get('/api/tickets').query({ q: 'חשבונית' }).expect(200);
    assert.equal(invoices.body.pagination.total, 2);
    const descriptionOnly = await request(app).get('/api/tickets').query({ q: 'כרטיס האשראי' }).expect(200);
    assert.equal(descriptionOnly.body.pagination.total, 0);
    const empty = await request(app).get('/api/tickets').query({ q: '   ', status: '' }).expect(200);
    assert.equal(empty.body.pagination.total, 25);
  });

  it('treats SQL injection payloads and wildcard characters as literal search text', async () => {
    await request(app).post('/api/tickets').send({ title: 'הנחה 50%_ללקוח' }).expect(201);
    const literal = await request(app).get('/api/tickets').query({ q: '%_' }).expect(200);
    assert.equal(literal.body.pagination.total, 1);
    const injection = await request(app).get('/api/tickets').query({ q: "' OR 1=1 --" }).expect(200);
    assert.equal(injection.body.pagination.total, 0);
    assert.equal((await request(app).get('/api/tickets')).body.pagination.total, 1);
  });

  it('allows every status transition and updates only the status', async () => {
    const { body } = await request(app).post('/api/tickets').send({ title: 'פנייה לבדיקה' });
    for (const status of ['closed', 'open', 'in_progress', 'closed', 'in_progress', 'open']) {
      const updated = await request(app).patch(`/api/tickets/${body.ticket.id}/status`).send({ status }).expect(200);
      assert.deepEqual(updated.body.ticket, { ...body.ticket, status });
    }
    await request(app).patch('/api/tickets/1/status').send({ status: 'deleted' }).expect(400);
    await request(app).patch('/api/tickets/1/status').send({ status: 'closed', title: 'modified' }).expect(400);
    await request(app).patch('/api/tickets/999/status').send({ status: 'open' }).expect(404);
    for (const id of ['abc', '0', '-1', '1.5', '9007199254740992']) {
      await request(app).patch(`/api/tickets/${id}/status`).send({ status: 'open' }).expect(400);
    }
  });

  it('reports an empty last page after a status change, with fresh totals', async () => {
    for (let index = 0; index < 11; index++) {
      await request(app).post('/api/tickets').send({ title: `פנייה לבדיקה ${index}` });
    }
    const last = await request(app).get('/api/tickets?status=open&page=2');
    assert.equal(last.body.tickets.length, 1);
    await request(app).patch(`/api/tickets/${last.body.tickets[0].id}/status`).send({ status: 'closed' }).expect(200);
    const updated = await request(app).get('/api/tickets?status=open&page=2').expect(200);
    assert.equal(updated.body.tickets.length, 0);
    assert.equal(updated.body.pagination.totalPages, 1);
    assert.equal(updated.body.pagination.total, 10);
  });

  it('rejects malformed queries, JSON, oversized bodies and unknown API routes', async () => {
    for (const query of ['page=0', 'page=-1', 'page=1.5', 'page=abc', 'page=9007199254740992', 'page=2147483648', 'status=bad', 'q=a&q=b', 'limit=100']) {
      await request(app).get(`/api/tickets?${query}`).expect(400);
    }
    await request(app).post('/api/tickets').set('Content-Type', 'application/json').send('{broken').expect(400);
    await request(app).post('/api/tickets').send({ title: 'א'.repeat(40000) }).expect(413);
    const unknown = await request(app).get('/api/unknown').expect(404);
    assert.ok(unknown.body.error.message);
    await request(app).get('/api/health').expect(200, { status: 'ok' });
  });

  it('returns a safe 500 response on an unexpected database failure', async () => {
    db.exec('DROP TABLE tickets');
    const { body } = await request(app).get('/api/tickets').expect(500);
    assert.ok(body.error.message);
    assert.equal(JSON.stringify(body).includes('no such table'), false);
  });
});

it('persists records and status updates after closing and reopening the SQLite file', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'service-tickets-test-'));
  const path = join(directory, 'tickets.sqlite');
  let db: DatabaseSync | undefined;
  try {
    db = openDatabase(path);
    let app = createApp(db);
    const { body } = await request(app).post('/api/tickets').send({ title: 'נשמרת לאחר הפעלה מחדש' }).expect(201);
    await request(app).patch(`/api/tickets/${body.ticket.id}/status`).send({ status: 'in_progress' }).expect(200);
    db.close();
    db = undefined;
    db = openDatabase(path);
    assert.equal(seedDatabaseIfEmpty(db), false);
    app = createApp(db);
    const list = await request(app).get('/api/tickets').expect(200);
    assert.equal(list.body.pagination.total, 1);
    assert.equal(list.body.tickets[0].title, body.ticket.title);
    assert.equal(list.body.tickets[0].status, 'in_progress');
  } finally {
    db?.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { PAGE_SIZE, type CreateTicketInput, type ListTicketsInput, type Ticket, type TicketListResponse, type TicketStatus } from '../shared/tickets.js';

type CreateResult = { kind: 'created' | 'replayed'; ticket: Ticket } | { kind: 'conflict' };
type UpdateResult = { kind: 'updated' | 'conflict'; ticket: Ticket } | { kind: 'missing' };

export class TicketRepository {
  constructor(private readonly db: DatabaseSync) {}

  list({ q, status, page }: ListTicketsInput): TicketListResponse {
    const conditions: string[] = [];
    const params: SQLInputValue[] = [];
    if (q) {
      // instr means a literal substring: %, _ and quotes are ordinary search text.
      conditions.push('instr(title, ?) > 0');
      params.push(q);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { total } = this.db.prepare(`SELECT COUNT(*) AS total FROM tickets ${where}`)
      .get(...params) as { total: number };
    const tickets = this.db.prepare(`
      SELECT id, title, description, status, created_at, version FROM tickets ${where}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE) as unknown as Ticket[];
    return {
      tickets,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    };
  }

  private insert(input: CreateTicketInput): Ticket {
    const ticket = this.db.prepare(`
      INSERT INTO tickets (title, description, status, created_at)
      VALUES (?, ?, 'open', ?) RETURNING id, title, description, status, created_at, version
    `).get(input.title, input.description, new Date().toISOString());
    return ticket as unknown as Ticket;
  }

  create(input: CreateTicketInput, idempotencyKey?: string): CreateResult {
    if (!idempotencyKey) return { kind: 'created', ticket: this.insert(input) };

    const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const existing = this.db.prepare(`
        SELECT request_hash, response_json FROM ticket_creation_requests WHERE idempotency_key = ?
      `).get(idempotencyKey) as { request_hash: string; response_json: string } | undefined;
      let result: CreateResult;
      if (existing) {
        result = existing.request_hash === hash
          ? { kind: 'replayed', ticket: JSON.parse(existing.response_json) as Ticket }
          : { kind: 'conflict' };
      } else {
        const ticket = this.insert(input);
        this.db.prepare(`
          INSERT INTO ticket_creation_requests (idempotency_key, request_hash, response_json) VALUES (?, ?, ?)
        `).run(idempotencyKey, hash, JSON.stringify(ticket));
        result = { kind: 'created', ticket };
      }
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  updateStatus(id: number, status: TicketStatus, expectedVersion: number): UpdateResult {
    const updated = this.db.prepare(`
      UPDATE tickets SET status = ?, version = version + 1 WHERE id = ? AND version = ?
      RETURNING id, title, description, status, created_at, version
    `).get(status, id, expectedVersion) as unknown as Ticket | undefined;
    if (updated) return { kind: 'updated', ticket: updated };
    const current = this.db.prepare(`
      SELECT id, title, description, status, created_at, version FROM tickets WHERE id = ?
    `).get(id) as unknown as Ticket | undefined;
    return current ? { kind: 'conflict', ticket: current } : { kind: 'missing' };
  }
}

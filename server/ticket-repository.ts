import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { PAGE_SIZE, type CreateTicketInput, type ListTicketsInput, type Ticket, type TicketListResponse, type TicketStatus } from '../shared/tickets.js';

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
      SELECT id, title, description, status, created_at FROM tickets ${where}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?
    `).all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE) as unknown as Ticket[];
    return {
      tickets,
      pagination: { page, pageSize: PAGE_SIZE, total, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) },
    };
  }

  create(input: CreateTicketInput): Ticket {
    const ticket = this.db.prepare(`
      INSERT INTO tickets (title, description, status, created_at)
      VALUES (?, ?, 'open', ?) RETURNING id, title, description, status, created_at
    `).get(input.title, input.description, new Date().toISOString());
    return ticket as unknown as Ticket;
  }

  updateStatus(id: number, status: TicketStatus): Ticket | undefined {
    return this.db.prepare(`
      UPDATE tickets SET status = ? WHERE id = ?
      RETURNING id, title, description, status, created_at
    `).get(status, id) as unknown as Ticket | undefined;
  }
}

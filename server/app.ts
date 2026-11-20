import express, { type ErrorRequestHandler } from 'express';
import type { DatabaseSync } from 'node:sqlite';
import { createTicketSchema, idempotencyKeySchema, listTicketsSchema, updateStatusSchema } from '../shared/tickets.js';
import { TicketRepository } from './ticket-repository.js';
import type { ZodError } from 'zod';

function validationError(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !fields[key]) fields[key] = issue.message;
  }
  return { error: { message: 'הבקשה אינה תקינה. יש לבדוק את הנתונים ולנסות שוב.', fields } };
}

export function createApp(db: DatabaseSync, options: { staticDirectory?: string; logErrors?: boolean } = {}) {
  const app = express();
  const tickets = new TicketRepository(db);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok' });
  });

  app.get('/api/tickets', (req, res) => {
    const input = listTicketsSchema.safeParse(req.query);
    if (!input.success) return res.status(400).json(validationError(input.error));
    return res.json(tickets.list(input.data));
  });

  app.post('/api/tickets', (req, res) => {
    const input = createTicketSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json(validationError(input.error));
    const rawKey = req.get('Idempotency-Key');
    const key = idempotencyKeySchema.optional().safeParse(rawKey);
    if (!key.success) return res.status(400).json({ error: { message: 'מפתח בקשת היצירה אינו תקין.' } });
    const result = tickets.create(input.data, key.data);
    if (result.kind === 'conflict') {
      return res.status(409).json({ error: {
        code: 'IDEMPOTENCY_KEY_REUSED',
        message: 'מפתח הבקשה כבר שימש ליצירת פנייה עם תוכן אחר.',
      } });
    }
    if (result.kind === 'replayed') res.setHeader('Idempotency-Replayed', 'true');
    return res.status(201).json({ ticket: result.ticket });
  });

  app.patch('/api/tickets/:id/status', (req, res) => {
    const id = Number(req.params.id);
    if (!/^[1-9]\d*$/.test(req.params.id ?? '') || !Number.isSafeInteger(id)) {
      return res.status(400).json({ error: { message: 'מזהה הפנייה אינו תקין.' } });
    }
    const input = updateStatusSchema.safeParse(req.body);
    if (!input.success) return res.status(400).json(validationError(input.error));
    const result = tickets.updateStatus(id, input.data.status, input.data.expectedVersion);
    if (result.kind === 'missing') return res.status(404).json({ error: { message: 'הפנייה לא נמצאה.' } });
    if (result.kind === 'conflict') {
      return res.status(409).json({ error: {
        code: 'VERSION_CONFLICT',
        message: 'הפנייה עודכנה בינתיים על ידי משתמש אחר. יש לבדוק את המצב העדכני ולנסות שוב.',
        currentTicket: result.ticket,
      } });
    }
    return res.json({ ticket: result.ticket });
  });

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: { message: 'כתובת ה־API לא נמצאה.' } });
  });

  if (options.staticDirectory) app.use(express.static(options.staticDirectory));

  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    const httpError = error as { type?: string; status?: number };
    if (httpError.type === 'entity.parse.failed') {
      res.status(400).json({ error: { message: 'גוף הבקשה חייב להיות JSON תקין.' } });
      return;
    }
    if (httpError.status === 413) {
      res.status(413).json({ error: { message: 'הבקשה גדולה מדי.' } });
      return;
    }
    if (options.logErrors !== false) console.error('Request failed:', error);
    res.status(500).json({ error: { message: 'אירעה שגיאה בשרת. אפשר לנסות שוב.' } });
  };
  app.use(handleError);
  return app;
}

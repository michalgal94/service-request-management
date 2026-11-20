import { z } from 'zod';

export const PAGE_SIZE = 10;
export const ticketStatuses = ['open', 'in_progress', 'closed'] as const;
export const statusSchema = z.enum(ticketStatuses);
export type TicketStatus = z.infer<typeof statusSchema>;

export const statusLabels: Record<TicketStatus, string> = {
  open: 'פתוחה',
  in_progress: 'בטיפול',
  closed: 'סגורה',
};

export const createTicketSchema = z.object({
  title: z.string({ error: 'יש להזין כותרת.' }).trim()
    .min(3, 'הכותרת צריכה להכיל לפחות 3 תווים.')
    .max(100, 'הכותרת יכולה להכיל עד 100 תווים.'),
  description: z.string({ error: 'התיאור חייב להיות טקסט.' })
    .max(2000, 'התיאור יכול להכיל עד 2,000 תווים.').trim().default(''),
}).strict();

export const updateStatusSchema = z.object({
  status: statusSchema,
  expectedVersion: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
}).strict();

export const idempotencyKeySchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

export const listTicketsSchema = z.object({
  q: z.string().trim().max(100, 'החיפוש יכול להכיל עד 100 תווים.').default(''),
  status: z.union([statusSchema, z.literal('')]).default(''),
  page: z.string().regex(/^[1-9]\d*$/).default('1').transform(Number)
    .refine((page) => Number.isSafeInteger(page) && page <= 2147483647),
}).strict();

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type ListTicketsInput = z.infer<typeof listTicketsSchema>;
export type TicketFilters = { q: string; status: TicketStatus | '' };
export type FieldErrors = Partial<Record<'title' | 'description', string>>;

export interface Ticket {
  id: number;
  title: string;
  description: string;
  status: TicketStatus;
  created_at: string;
  version: number;
}

export interface TicketListResponse {
  tickets: Ticket[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface ApiErrorBody {
  error: {
    message: string;
    fields?: Record<string, string>;
    code?: 'VERSION_CONFLICT' | 'IDEMPOTENCY_KEY_REUSED';
    currentTicket?: Ticket;
  };
}

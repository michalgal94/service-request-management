import type { ApiErrorBody, CreateTicketInput, Ticket, TicketFilters, TicketListResponse, TicketStatus } from '../../shared/tickets.js';

export class ApiError extends Error {
  constructor(message: string, public readonly fields?: Record<string, string>, public readonly code?: ApiErrorBody['error']['code']) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const timeout = AbortSignal.timeout(15000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ApiError(timeout.aborted
      ? 'הבקשה נמשכת זמן רב מדי. אפשר לנסות שוב.'
      : 'לא ניתן להתחבר לשרת. בדקו את החיבור ונסו שוב.');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as ApiErrorBody | null;
    throw new ApiError(body?.error?.message ?? 'לא ניתן להשלים את הבקשה. אפשר לנסות שוב.', body?.error?.fields, body?.error?.code);
  }
  return response.json() as Promise<T>;
}

export const api = {
  list(filters: TicketFilters, page: number, signal: AbortSignal) {
    const params = new URLSearchParams({ q: filters.q, status: filters.status, page: String(page) });
    return request<TicketListResponse>(`/tickets?${params}`, { signal });
  },
  create(input: CreateTicketInput, idempotencyKey: string) {
    return request<{ ticket: Ticket }>('/tickets', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    });
  },
  updateStatus(id: number, status: TicketStatus, expectedVersion: number) {
    return request<{ ticket: Ticket }>(`/tickets/${id}/status`, {
      method: 'PATCH', body: JSON.stringify({ status, expectedVersion }),
    });
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'אירעה שגיאה. אפשר לנסות שוב.';
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TicketFilters, TicketListResponse } from '../../../shared/tickets.js';
import { api, errorMessage } from '../api.js';

interface ListRequest { filters: TicketFilters; page: number; revision: number }
const initialRequest: ListRequest = { filters: { q: '', status: '' }, page: 1, revision: 0 };

export function useTickets() {
  const [request, setRequest] = useState(initialRequest);
  const currentRequest = useRef(initialRequest);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [view, setView] = useState<{
    data: TicketListResponse | null; loading: boolean; error: string | null;
  }>({ data: null, loading: true, error: null });

  // Invalidate before effect cleanup to reject late responses.
  const schedule = useCallback((next: Omit<ListRequest, 'revision'>) => {
    generation.current += 1;
    controller.current?.abort();
    const updated = { ...next, revision: currentRequest.current.revision + 1 };
    currentRequest.current = updated;
    setView((previous) => ({ ...previous, loading: true, error: null }));
    setRequest(updated);
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    const id = ++generation.current;
    setView((previous) => ({ ...previous, loading: true, error: null }));

    api.list(request.filters, request.page, abort.signal).then((data) => {
      if (abort.signal.aborted || id !== generation.current) return;
      if (data.tickets.length === 0 && request.page > 1) {
        schedule({ filters: request.filters, page: Math.min(request.page - 1, data.pagination.totalPages) });
        return;
      }
      setView({ data, loading: false, error: null });
    }).catch((error: unknown) => {
      if (abort.signal.aborted || id !== generation.current) return;
      setView((previous) => ({ ...previous, loading: false, error: errorMessage(error) }));
    });

    return () => abort.abort();
  }, [request, schedule]);

  return {
    ...view,
    filters: request.filters,
    page: request.page,
    search: (filters: TicketFilters) => schedule({ filters, page: 1 }),
    goToPage: (page: number) => schedule({ filters: currentRequest.current.filters, page }),
    refresh: () => schedule(currentRequest.current),
    reset: () => schedule(initialRequest),
  };
}

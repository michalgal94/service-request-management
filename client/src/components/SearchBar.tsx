import { useState, type FormEvent } from 'react';
import type { TicketFilters } from '../../../shared/tickets.js';
import { Icon } from './Icon.js';
import { StatusSelect } from './StatusSelect.js';

export function SearchBar({ onSearch }: { onSearch: (filters: TicketFilters) => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<TicketFilters['status']>('');

  function submit(event: FormEvent) {
    event.preventDefault();
    onSearch({ q: q.trim(), status });
  }

  return (
    <form className="search-panel" role="search" aria-label="חיפוש וסינון פניות" onSubmit={submit}>
      <div className="search-field">
        <label htmlFor="search-title">חיפוש פניות</label>
        <div className="input-with-icon">
          <Icon name="search" />
          <input id="search-title" type="search" placeholder="חיפוש לפי כותרת הפנייה..." value={q}
            maxLength={100} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="filter-field">
        <label htmlFor="search-status">סטטוס</label>
        <StatusSelect id="search-status" label="סינון לפי סטטוס" value={status} onChange={setStatus} allowAll />
      </div>
      <button type="submit" className="button button-primary search-button"><Icon name="search" />חפש</button>
    </form>
  );
}
